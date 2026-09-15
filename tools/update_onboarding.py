from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'web/index.html'
s = p.read_text(encoding='utf-8')
s = s.replace('絵を分けて、動きをつくる。', 'パーツを整え、キャラクターを動かす。')
s = s.replace('>配信を使う</button>', '>キャラクターを使う</button>')
start = s.index('<div class="start-intro">')
end = s.index('<div id="startSourceHost">', start)
s = s[:start] + '''<div class="start-intro"><span class="eyebrow">SVG-Through Motion</span>
<h1>分けたイラストに、<br/>まばたきと動きを。</h1>
<p>用意するのは、<strong>元絵</strong>と、その絵を<strong>See-Throughで分割したPSD</strong>。<br/>目・口を整えて、動くキャラクターに仕上げます。</p>
<p class="start-process">形を整える <span>→</span> 動きをつける <span>→</span> 動画・ゲーム素材や、AIと話すキャラクターに</p>
<div class="start-actions"><button class="primary" id="startOwn" type="button">自分の素材で作る</button><button id="startSample" type="button" disabled>Tethで試す</button></div>
<p class="start-footnote">サンプルは素材の準備なしで試せます。編集は自分のコピーに保存できます。</p>
</div>
<section class="start-example" aria-label="Tethの素材と完成例">
<div class="example-heading"><h2>Tethで見る、素材から完成まで</h2><button id="samplePlay" type="button" disabled>動きを止める</button></div>
<div class="example-cards">
<figure><div class="example-art"><img id="sampleOriginal" alt="Tethの元絵：両目と口が開いたイラスト"/></div><figcaption><strong>元絵</strong><span>両目と口が開いた画像を1枚。</span></figcaption></figure>
<figure><div class="example-art sample-layers" id="sampleLayers"></div><figcaption><strong>See-Throughで分割したPSD</strong><span>これはPSDの中身の例です。<br/>別々のPNGを用意する必要はありません。</span></figcaption></figure>
<figure><div class="example-art" id="sampleMotion"></div><figcaption><strong>SVG-Throughで動かした例</strong><span>まばたき・口パク・待機の揺れ。</span></figcaption></figure>
</div><p class="tiny" id="sampleStatus" role="status">サンプルを読み込んでいます…</p>
</section>
''' + s[end:]
start = s.index('<h2>作り方を選ぶ</h2>')
end = s.index('<label class="source-file">1.', start)
methods = '''<details class="import-settings donor-options" id="optionalDonors"><summary>閉じ目・閉じ口の差分も使う〈任意〉</summary>
<div class="import-methods" role="radiogroup" aria-label="閉じ目・閉じ口の作り方">
<label><input type="radio" name="importMode" value="basic" checked/><span><strong>差分を使わず、下書きから整える</strong></span></label>
<label><input type="radio" name="importMode" value="donors"/><span><strong>用意した差分PSDを使う</strong></span></label>
</div><p class="tiny" id="importMethodHint"></p>'''
s = s[:start] + '<h2>素材を用意する</h2><p class="import-help">同じ絵の画像とPSDを、セットで読み込みます。元絵は両目と口が開いたものを選んでください。</p>\n' + s[end:]
s = s.replace('1. 元画像 <span>', '元絵 <span>').replace('2. 対応するPSD<input', 'その元絵をSee-Throughで分割したPSD<input')
s = s.replace('PSDは、上の元画像をSee-Throughなどでパーツ分けしたもの。画像と同じキャンバスサイズ・位置で用意してください。', '元絵とPSDは、同じキャンバスサイズ・位置で用意してください。')
s = s.replace('<section id="faceDonorOptions"', '<div id="finishMethodMount"></div>\n' + methods + '<section id="faceDonorOptions"', 1)
s = s.replace('</details></section><section class="control-card"><h3>SVGの仕上がり', '</details></section></details><section class="control-card"><h3>SVGの仕上がり', 1)
s = s.replace('aria-label="配信の操作"', 'aria-label="キャラクターの使い方"').replace('>配信設定</button>', '>キャラクターを使う</button>')
start = s.index('<section class="motion-destinations">')
end = s.index('</section>', start) + len('</section>')
s = s[:start] + '''<section class="motion-destinations" aria-label="作ったキャラクターの使い方"><h3>できたキャラクターを使う</h3>
<button class="primary" id="exportTop" type="button"><strong>書き出す</strong><small>画像・動画・ゲーム素材に</small></button>
<button id="motionUse" type="button"><strong>キャラクターを使う</strong><small>別ウィンドウで表示・AIの発話を受け付ける</small></button>
<button id="motionVoice" type="button"><strong>音声を合わせる</strong><small>必要なら、動画用の声と口パクを調整</small></button>
</section>''' + s[end:]
s = s.replace('<div id="liveMount"></div>', '<div id="liveMount"></div><p class="tiny">字幕や感情の演出まで作りたいときは、SpriTalkで。</p>')
p.write_text(s, encoding='utf-8')

p = root / 'web/assist-entry.js'
s = p.read_text(encoding='utf-8').replace('<h3>進め方</h3>', '<h3>仕上げ方を選ぶ</h3>').replace('checked>自分で作る', 'checked>自分で調整する').replace('value="ai">最初からAIに任せる', 'value="ai">目・口と動きをAIに任せる')
s = s.replace('<div data-ai-options hidden>', '<p class="tiny" data-manual-hint>途中からAIに頼むこともできます。</p><div data-ai-options hidden>')
s = s.replace("document.getElementById('importFields').prepend(box)", "document.getElementById('finishMethodMount').append(box)")
s = s.replace("box.querySelector('[data-ai-options]').hidden=!enabled();", "box.querySelector('[data-ai-options]').hidden=!enabled();box.querySelector('[data-manual-hint]').hidden=enabled();")
p.write_text(s, encoding='utf-8')
p = root / 'web/workspace-ui.js'
s = p.read_text(encoding='utf-8').replace("'配信を使う'", "'キャラクターを使う'").replace("mic:['配信'", "mic:['キャラクター'").replace("tracking:['配信'", "tracking:['キャラクター'")
s = s.replace("$('motionVoice').onclick=()=>show('voice');", "$('motionVoice').onclick=()=>show('voice');$('motionUse').onclick=()=>show('live');")
p.write_text(s, encoding='utf-8')
