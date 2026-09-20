"""Bounded local REST transport for MCP. No redirects, proxy, arbitrary URL or shell."""
import io
import json
import re
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx

from .agent_catalog import catalog

MAX_BYTES = 100 * 1024**2


class AgentClient:
    def __init__(self, url, allow_dirs=(), transport=None):
        parsed = urlparse(url)
        if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
                or parsed.path not in ('', '/') or parsed.username or parsed.password
                or parsed.query or parsed.fragment):
            raise ValueError('接続先はループバックHTTP originで指定してください')
        self.url = url.rstrip('/')
        self.allow_dirs = [Path(p).resolve(strict=True) for p in allow_dirs]
        if any(not p.is_dir() for p in self.allow_dirs):
            raise ValueError('--allow-dirには存在するフォルダーを指定してください')
        self.http = httpx.Client(base_url=self.url, trust_env=False, follow_redirects=False,
                                 timeout=60, transport=transport)

    def close(self):
        self.http.close()

    def request(self, method, path, limit=MAX_BYTES, **kwargs):
        with self.http.stream(method, path, **kwargs) as response:
            raw = bytearray()
            for chunk in response.iter_bytes():
                raw.extend(chunk)
                if len(raw) > limit:
                    raise ValueError('応答が大きすぎます。ファイル単位で取得してください')
            if not 200 <= response.status_code < 300:
                raise ValueError(f'HTTP {response.status_code}: ' + raw[:4000].decode('utf-8', errors='replace'))
            return response.status_code, bytes(raw), response.headers.get('content-type', '')

    def get_json(self, path):
        return json.loads(self.request('GET', path)[1])

    def operation(self, name, path=None, query=None):
        entry = next((item for item in catalog() if item['name'] == name), None)
        if entry is None:
            raise ValueError('未知の操作名です。svg_operationsで確認してください')
        parameters = path or {}
        required = re.findall(r'{(\w+)}', entry['path'])
        if set(parameters) != set(required):
            raise ValueError('pathのキーは ' + ', '.join(required) + ' に一致させてください')
        route = entry['path']
        for key, value in parameters.items():
            if not isinstance(value, str) or not re.fullmatch(r'[\w-]{1,100}', value):
                raise ValueError('不正なパス引数です')
            route = route.replace('{'+key+'}', quote(value, safe=''))
        spec = self.get_json('/api/agent/operations/'+quote(name, safe=''))
        allowed_query = {p['name'] for p in spec['operation'].get('parameters', []) if p['in'] == 'query'}
        if set(query or {}) - allowed_query:
            raise ValueError('未知のquery引数です。svg_describeで確認してください')
        return entry, route, spec

    def execute(self, name, path=None, query=None, body=None, read_only=False):
        entry, route, spec = self.operation(name, path, query)
        if read_only and not entry['read_only']:
            raise ValueError('変更操作にはsvg_writeを使ってください')
        content = spec['operation'].get('requestBody', {}).get('content', {})
        if content and 'application/json' not in content:
            raise ValueError('この操作にはsvg_uploadを使ってください')
        if not content and body is not None:
            raise ValueError('この操作にbodyはありません')
        status, raw, mime = self.request(entry['method'], route, params=query, **({'json': body} if body is not None else {}))
        if 'json' not in mime:
            raise ValueError('JSON以外の結果はsvg_downloadで取得してください')
        return dict(http_status=status, data=json.loads(raw))

    def local_path(self, value, *, writing=False):
        path = Path(value)
        if not path.is_absolute():
            raise ValueError('絶対パスを指定してください')
        # Resolve symlinks/junctions before checking the configured workspace roots.
        path = path.resolve(strict=not writing)
        if not any(path.is_relative_to(root) for root in self.allow_dirs):
            raise ValueError('このファイルは--allow-dirで許可した範囲外です')
        if ':' in path.name or path.name in ('.', '..'):
            raise ValueError('不正なファイル名です')
        if writing:
            if not path.parent.is_dir() or path.exists():
                raise ValueError('保存先には存在するフォルダー内の新しいファイル名を指定してください')
        elif not path.is_file() or path.stat().st_size > MAX_BYTES:
            raise ValueError('入力ファイルは100MB以下にしてください')
        return path

    def upload(self, name, files, fields=None, path=None, query=None):
        entry, route, spec = self.operation(name, path, query)
        content = spec['operation'].get('requestBody', {}).get('content', {})
        if entry['read_only'] or 'multipart/form-data' not in content:
            raise ValueError('multipartアップロードの操作を指定してください')
        schema = content['multipart/form-data']['schema']
        if '$ref' in schema:
            schema = spec['components']['schemas'][schema['$ref'].rsplit('/', 1)[-1]]
        props = schema.get('properties', {})
        binary = {k for k, v in props.items() if v.get('format') == 'binary' or
                  any(x.get('format') == 'binary' for x in v.get('anyOf', []))}
        fields = fields or {}
        if set(files) - binary or set(fields) - (set(props) - binary):
            raise ValueError('ファイル名またはフォーム引数が不正です。svg_describeで確認してください')
        if set(schema.get('required', [])) - (set(files) | set(fields)):
            raise ValueError('必須のファイルまたはフォーム引数が不足しています')
        local = {key: self.local_path(value) for key, value in files.items()}
        if sum(p.stat().st_size for p in local.values()) > MAX_BYTES:
            raise ValueError('1回のアップロードは合計100MB以下にしてください')
        with ExitStack() as stack:
            parts = {key: (p.name, stack.enter_context(p.open('rb'))) for key, p in local.items()}
            data = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in fields.items()}
            status, raw, _ = self.request(entry['method'], route, params=query, files=parts, data=data)
        return dict(http_status=status, data=json.loads(raw))

    @staticmethod
    def asset_path(path):
        # Only server-issued material/project/export paths. Never web pages or native endpoints.
        if not isinstance(path, str) or '%' in path or '\\' in path or '..' in path:
            raise ValueError('アプリが返した素材の相対URLを指定してください')
        patterns = [r'/assets/[a-f0-9]{32}/[\w/-]+\.(?:png|jpg|jpeg|webp|svg|json)',
                    r'/api/projects/[a-f0-9]{32}/bundle',
                    r'/api/materials/[a-f0-9]{32}/files/[\w.-]+',
                    r'/api/exports/[a-f0-9]{32}/[\w.-]+',
                    r'/api/assist/assets/[a-f0-9]{32}/preview',
                    r'/api/stage/assets/[a-f0-9]{32}/image',
                    r'/api/stage/presets/[a-f0-9]{32}',
                    r'/api/stage/sessions/[a-f0-9]{32}/preview']
        if not any(re.fullmatch(p, path) for p in patterns):
            raise ValueError('公開された素材URLではありません')
        return path

    def preview(self, path):
        from PIL import Image
        _, raw, _ = self.request('GET', self.asset_path(path), limit=20*1024**2)
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ('PNG', 'JPEG', 'WEBP') or source.width*source.height > 40_000_000:
                raise ValueError('確認画像は40MP以下のPNG・JPEG・WebPにしてください')
            source.thumbnail((1536, 1536))
            result = io.BytesIO()
            source.convert('RGBA').save(result, format='PNG')
            return result.getvalue()

    def download(self, path, destination):
        target = self.local_path(destination, writing=True)
        _, raw, mime = self.request('GET', self.asset_path(path))
        with target.open('xb') as out:
            out.write(raw)
        return dict(path=str(target), bytes=len(raw), mime_type=mime)
