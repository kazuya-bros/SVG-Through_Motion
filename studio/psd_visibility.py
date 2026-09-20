"""Explain hidden required layers without changing the author's PSD."""


def require_visible_if_present(layers, predicate, context):
    matches = [layer for layer in layers if not layer.is_group() and predicate(layer)]
    if matches and not any(layer.is_visible() for layer in matches):
        names = '、'.join(dict.fromkeys(layer.name for layer in matches))
        raise ValueError(
            f'{context}のレイヤー「{names}」は存在しますが、非表示です。'
            '編集ソフトで使用するレイヤーと親グループの表示（目のアイコン）をONにし、'
            'PSDを保存し直してから、もう一度読み込んでください。'
        )
