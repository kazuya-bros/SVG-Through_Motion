"""Agent discovery without requiring an editor or exposing native credentials."""
from fastapi import APIRouter, HTTPException, Request
from .agent_catalog import catalog

router = APIRouter(prefix='/api/agent', tags=['Agent control'])


@router.get('/capabilities')
async def capabilities():
    from .control import status
    from .runtime import listing
    return dict(protocol_version=1, editor=await status(), outputs=await listing(),
                stage_preview='/api/stage/sessions/{sid}/preview (svg_preview)',
                operations_url='/api/agent/operations', guide_url='/web/control-help.html',
                transports=['http', 'mcp-stdio'],
                limitations=[
                    '編集・描画・書き出しにはAI接続中の編集画面が必要です。',
                    '出力作成APIはセッションとURLを返します。ウィンドウを開く操作はUI / Computer Useで行います。',
                    'カメラ・マイク・音声再生の初回許可は画面で行います。',
                    '画像生成モデルは内蔵しません。See-Through / Depthには生成環境が必要です。',
                ], result_policy='202は受付です。結果URLを確認し、応答不明時に変更操作を無条件で再送しないでください。')


@router.get('/operations')
def operations():
    return catalog()


@router.get('/operations/{name}')
def describe(name: str, request: Request):
    entry = next((item for item in catalog() if item['name'] == name), None)
    if entry is None:
        raise HTTPException(404, '操作名がありません')
    schema = request.app.openapi()
    operation = schema['paths'][entry['path']][entry['method'].lower()]
    # Keep only referenced schemas, preserving standard OpenAPI reference paths.
    components = {}
    def collect(value):
        if isinstance(value, dict):
            ref = value.get('$ref', '')
            if ref.startswith('#/components/schemas/'):
                key = ref.rsplit('/', 1)[-1]
                if key not in components:
                    components[key] = schema['components']['schemas'][key]
                    collect(components[key])
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(operation)
    return dict(**entry, operation=operation, components=dict(schemas=components))
