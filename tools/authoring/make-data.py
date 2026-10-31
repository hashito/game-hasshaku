# One-off generator of the story data (data/*.json except plan.json). Edit here, then run:
#   python3 tools/authoring/make-data.py
# Text comes from v4 (hasshaku-boundary-v4.html). Fixed on the way: the record names and where they lie, the talisman's place,
# the leftover "peaches" line, and the gate notices (both now say 東・南・北).
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
def dump(name, obj):
    p = os.path.join(ROOT, 'data', name)
    json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', name)

P = 'assets/photos/'

# ---------------------------------------------------------------- stages
stages = {
    'goal': {'title': '朝を待ち、村境を越える', 'short': '村境を越える', 'sub': '祖父の家で一夜を越し、迎えの車で村の外へ出る。', 'meter': '夜の進み'},
    'levels': [
        {'id': 'L1', 'name': '異影', 'title': '生垣の向こう', 'time': '十八時四十分', 'unlocks': ['village']},
        {'id': 'L2', 'name': '四隅', 'title': '今夜を越す部屋', 'time': '十九時十分', 'unlocks': ['prep']},
        {'id': 'L3', 'name': '呼び声', 'title': '朝になるまで、開けない', 'time': '深夜', 'unlocks': ['night']},
        {'id': 'L4', 'name': '迎えの道', 'title': '朝にも、まだいる', 'time': '午前七時', 'unlocks': ['dawn']},
        {'id': 'L5', 'name': '境越え', 'title': '窓の外を、確かめない', 'time': '午前七時八分', 'unlocks': ['border']},
    ],
    'unlocks': {
        'village': {'name': '村の道と夕霧商店', 'icon': 'map', 'desc': '最初から歩ける。地図は手帳（Tab）の「地図」でいつでも見られる。'},
        'prep': {'name': '家の奥の部屋', 'icon': 'door', 'desc': '祖父に話すと、台所・納戸・北の座敷に入れるようになる。'},
        'night': {'name': '夜明けまでの守り', 'icon': 'clock', 'desc': '座敷の襖が閉まる。七時まで、塩を見張って過ごす。'},
        'dawn': {'name': '北の農道', 'icon': 'door', 'desc': '朝になると家を出られる。車止めを開けると、迎えの車まで行ける。'},
        'border': {'name': '村境', 'icon': 'flag', 'desc': '車で地蔵の境を越える。札を握り、窓を見続けない。'},
    },
}

# ---------------------------------------------------------------- tasks (S16: every work task has a short game element)
def steps(*s):
    return [dict(text=t, body=b, done=d, **({'emphasis': e} if e else {})) for t, b, d, e in s]

tasks = [
    {'id': 'T_SHOP', 'title': '夕霧商店で醤油と電池を買う', 'stage': 'L1', 'room': 'SHOP', 'station': 'S_COUNTER',
     'meaning': '祖父に頼まれた使い。懐中電灯の電池が切れかけている。',
     'hint': '家を出て道なりに北へ。二つ目の電柱を過ぎたら左。赤い看板の店が夕霧商店。',
     'minigame': {'type': 'align', 'cfg': {'title': '帳場：品物を袋に入れる', 'item': '醤油の瓶', 'mark': '袋の口', 'help': 'つまみを動かして、瓶を袋の口に合わせてください。'}},
     'steps': steps(('地図で夕霧商店の場所を見る', 'Tab（タッチは右上のメニュー）で手帳を開き、「地図」のタブを選びます。', 'look', None),
                    ('道を北へ歩いて商店へ', '二つ目の電柱を過ぎたら左です。赤い看板が見えます。', 'look', 'station:S_COUNTER'),
                    ('帳場で品物を受け取る', '店のおばさんに話しかけると、品物を渡してくれます。', 'task', None))},
    {'id': 'T_REPORT', 'title': '祖父に、見たものを話す', 'stage': 'L1', 'room': 'IMA', 'station': 'S_GRANDPA', 'needs': ['T_SHOP'],
     'meaning': '帰り道で見た、背の高い人のことを伝えるため。',
     'hint': '祖父は居間にいる。玄関の木戸から家に入る。',
     'steps': steps(('家へ戻る', '来た道を南へ戻ります。生垣の上に何か見えても、立ち止まらずに。', 'look', None),
                    ('居間の祖父に話す', '玄関の木戸を開けて、居間にいる祖父に話しかけます。', 'task', 'station:S_GRANDPA'))},
]
bowls = [('NW', '北西'), ('NE', '北東'), ('SW', '南西'), ('SE', '南東')]
for k, name in bowls:
    tasks.append({'id': f'T_SALT_{k}', 'title': f'{name}の皿に塩を盛る', 'stage': 'L2', 'room': 'ZASHIKI', 'station': f'S_BOWL_{k}',
                  'meaning': '座敷の四隅に塩を置くと、外のものが入りにくくなる、と祖父は言う。',
                  'hint': '粗塩の袋は台所の作業台にある。',
                  'minigame': {'type': 'salt', 'cfg': {'title': f'{name}の皿：塩を盛る', 'help': '押している間、塩が落ちます。線のところで離してください。'}},
                  'steps': steps(('台所で粗塩の袋を取る', '中廊下の西、台所の作業台にあります。', 'look', 'item:I_SALT'),
                                 (f'座敷の{name}の皿に塩を盛る', '座敷の四隅に、小さな皿が置いてあります。', 'task', f'station:S_BOWL_{k}'))})
tasks += [
    {'id': 'T_WINDOW', 'title': '座敷の窓を新聞紙でふさぐ', 'stage': 'L2', 'room': 'ZASHIKI', 'station': 'S_WINDOW',
     'meaning': '外から部屋の中が見えないようにする。中からも、外を見ないで済む。',
     'hint': '古い新聞は納戸の机にある。',
     'minigame': {'type': 'wipe', 'cfg': {'title': '北の格子窓：新聞紙を貼る', 'help': '窓をなぞって、新聞紙を端まで押さえてください。'}},
     'steps': steps(('納戸で新聞紙を取る', '中廊下の西、納戸の机の上です。', 'look', 'item:I_PAPER'),
                    ('北の格子窓をふさぐ', '座敷の北の窓です。', 'task', 'station:S_WINDOW'))},
    {'id': 'T_SEAL', 'title': '座敷の内側から、襖に札を貼る', 'stage': 'L2', 'room': 'ZASHIKI', 'station': 'S_SEAL',
     'needs': ['T_SALT_NW', 'T_SALT_NE', 'T_SALT_SW', 'T_SALT_SE', 'T_WINDOW'],
     'meaning': '札を戸に貼ると、朝まで部屋を守れる。もう一枚は身につけておく。',
     'hint': 'Ｋさんの札は、居間の仏壇の横に置いてある。',
     'minigame': {'type': 'align', 'cfg': {'title': '襖：札を貼る', 'item': '札', 'mark': '襖の合わせ目', 'help': '札を、襖の合わせ目にまっすぐ合わせてください。'}},
     'steps': steps(('居間の仏壇の横で札を受け取る', 'Ｋさんの札は二枚。一枚を戸に、もう一枚を手元に。', 'look', 'item:I_OFUDA'),
                    ('座敷に入り、襖の内側に札を貼る', '四隅の塩と窓の目張りが済んでから貼ります。', 'task', 'station:S_SEAL'))},
    {'id': 'T_DAWN', 'title': '朝七時まで、戸を開けずに塩を守る', 'stage': 'L3', 'room': 'ZASHIKI', 'station': 'S_CLOCK',
     'meaning': '七時になれば、自分で戸を開けてよい。それまでは、誰の声でも開けない。',
     'hint': '黒くなった皿があれば、近づいて塩を替える。',
     'steps': steps(('黒くなった塩を替える', '黒ずんだ皿に近づき、[E] を押し続けると白い塩に替えられます。', 'look', None),
                    ('七時まで戸を開けない', '声が聞こえても返事をしません。時計は画面の右上にあります。', 'task', None))},
    {'id': 'T_GATE', 'title': '北の農道の車止めを開ける', 'stage': 'L4', 'room': 'O_ROAD', 'station': 'S_GATE',
     'meaning': '迎えの車は、車止めの向こうで待っている。',
     'hint': '門柱の貼り紙を読む。三つの回し金を、左から順に合わせる。',
     'minigame': {'type': 'gate', 'cfg': {'title': '農道の車止め：三つの回し金'}},
     'steps': steps(('家を出て、村道を北へ', '白い姿が道にいます。見つからないよう、建物や生垣の陰を通ります。', 'look', None),
                    ('門柱の貼り紙を読む', '車止めの左の門柱に貼ってあります。', 'look', 'doc:N_NOTICE'),
                    ('回し金を合わせて車止めを開ける', '貼り紙のとおりに、三つの向きを合わせます。', 'task', 'station:S_GATE'))},
    {'id': 'T_CAR', 'title': '迎えの車に乗る', 'stage': 'L4', 'room': 'O_GATE', 'station': 'S_CAR', 'needs': ['T_GATE'],
     'meaning': 'Ｋさんの車で村境の地蔵を越えれば、外へ出られる。',
     'hint': '車止めの先、道の真ん中に停まっている。右側の戸から乗る。',
     'steps': steps(('車止めを抜けて、車の右の戸へ', '振り返らずに、車の明かりを見て進みます。', 'task', 'station:S_CAR'),)},
    {'id': 'T_RIDE', 'title': '札を握り、村境を越える', 'stage': 'L5', 'room': 'O_GATE', 'station': 'S_CAR', 'needs': ['T_CAR'],
     'meaning': '村境を越えるまで、窓の外の声に顔を向けない。',
     'hint': '[Space]・[E]（タッチは「札を握る」）を押している間、目を伏せていられる。',
     'steps': steps(('札を握って目を伏せる', '押している間は下を向き、窓を見ずに済みます。', 'look', None),
                    ('村境の地蔵を越える', '画面上の「村境まで」が満ちるまで、窓を見続けないでください。', 'task', None))},
]

# ---------------------------------------------------------------- items
items = [
    {'id': 'I_LIGHT', 'name': '懐中電灯', 'photo': '', 'desc': '祖父の家の懐中電灯。[F]（タッチは灯りのボタン）で点けたり消したりできる。',
     'why': '夜道と、家の暗い部屋を照らすため。', 'feeling': '電池が弱くなっている。だから買いに行くんだった。', 'room': 'O_FRONT', 'stage': 'L1', 'start': True},
    {'id': 'I_SALT', 'name': '粗塩の袋', 'photo': P + 'salt-scene.webp', 'desc': '台所の作業台にあった粗塩。四隅の皿に盛り、黒ずんだら替える。',
     'why': '座敷の四隅を守るため。黒くなった塩を替える分もある。', 'feeling': '思ったより重い。何度も使ってきた袋だ。', 'room': 'DAIDOKORO', 'stage': 'L2', 'x': -17.0, 'z': 15.2, 'y': 0.92},
    {'id': 'I_PAPER', 'name': '新聞紙（村の便り）', 'photo': '', 'desc': '納戸の机に重ねてあった古い新聞。座敷の北の窓をふさぐのに使う。',
     'why': '外から部屋の中を見られないようにするため。', 'feeling': '「北の木戸は日没で閉鎖」。見出しが小さい。', 'room': 'NANDO', 'stage': 'L2', 'x': -17.0, 'z': 7.0, 'y': 0.8},
    {'id': 'I_OFUDA', 'name': 'Ｋさんの札', 'photo': '', 'desc': '「身代守」と書かれた札が二枚。一枚は襖に、もう一枚は手元に持つ。車の中では握りしめる。',
     'why': '朝まで部屋を守り、村境まで身を守るため。', 'feeling': '墨の匂いが新しい。今日、書いたばかりの札だ。', 'room': 'IMA', 'stage': 'L2', 'x': -10.9, 'z': 18.45, 'y': 0.42},
]

# ---------------------------------------------------------------- docs (the three records are the side quests, S9 / S13)
docs = [
    {'id': 'N_LETTER', 'title': '祖母の置き手紙', 'room': 'IMA', 'stage': 'L1', 'x': -8.4, 'z': 16.6, 'record': True,
     'text': 'おかえり。ご飯は冷蔵庫にあります。\n北の部屋は掃除しておきました。窓際にある小さなお皿は捨てないでください。欠けているのもありますが、四枚そろっているのが大事なんだそうです。\n帰りのバスの時刻は古いので、電話で確かめること。お盆は一本少なくなっています。\n追伸。玄関の靴は、帰る向きにそろえておきました。',
     'feeling': '祖母の字だ。けれど、祖母の姿をまだ見ていない。'},
    {'id': 'N_PHOTO', 'title': '四人で写った写真', 'room': 'NANDO', 'stage': 'L2', 'x': -18.4, 'z': 9.4, 'record': True,
     'text': '祖父と祖母、まだ小さかった私、その手を引く母。家の生垣の前で撮った写真だ。母だけが、カメラより高いところを見ている。\n写真の裏に、母の字で短く書いてある。\n「次に来るときは、必ず一緒に帰ること。私だけ先に帰らないこと」\n子供のころは、車酔いを心配して書いたのだと思っていた。',
     'feeling': '母が見上げている先に、生垣の上の何かが写っている気がする。'},
    {'id': 'N_DIARY', 'title': '道守りの覚え書き', 'room': 'O_SHRINE', 'stage': 'L1', 'x': 11.6, 'z': -13.45, 'record': True,
     'text': '八月二日。北の車止めを修繕。風で開かぬよう、三つの回し金を取り付けた。左から、朝日が出る方、正午に日がある方、北の地蔵の方に合わせる。すなわち「東・南・北」。門柱にも同じ説明を記す。\n四方の地蔵に破損なし。西の一体だけ、前掛けの結び目を直した。\n八月十日。県外へ出た者の帰省について問い合わせ。境を越えたら終わり、とは伝えないこと。出られた人を、また戻してはいけない。家の法事でも同じ。',
     'feeling': '「出られた人を、また戻してはいけない」。母は、だから帰ってこなかったのか。'},
    {'id': 'N_NOTICE', 'title': '門柱の貼り紙', 'room': 'O_ROAD', 'stage': 'L4', 'x': -2.8, 'z': -23.6,
     'text': '三つの回し金\n左から順に、朝日が出る方、正午に日がある方、北の地蔵の方。\nそれぞれの金具を押すと、九十度ずつ回ります。\n（左から 東・南・北）',
     'feeling': '雨で滲んでいるが、読める。三つ目は「北」。'},
]

# ---------------------------------------------------------------- things to examine (S13: pieces of the past, U19: a separate thought)
things = [
    {'id': 'TH_MAPBOARD', 'room': 'O_FRONT', 'position': [-2.6, 17.6], 'y': 1.1, 'label': '玄関の外の地図板', 'photo': P + 'route-map.webp', 'size': 1,
     'text': ['祖父が描いた道の地図。家を出て北、二つ目の電柱から左。社を越えた先に赤い看板。', '地図は手帳（Tab）の「地図」でも見られる。'],
     'feeling': '裏道まで描いてある。たかが買い物なのに。'},
    {'id': 'TH_HEDGE', 'room': 'O_FRONT', 'position': [4.0, 13.0], 'y': 1.2, 'label': '田んぼの生垣', 'size': 1,
     'text': ['大人の背より高い生垣。向こうは田んぼだ。', '生垣の上に、何かが乗っていた跡はない。'],
     'feeling': 'あの帽子は、この上を歩いていた。'},
    {'id': 'TH_POLE', 'room': 'O_ROAD', 'position': [-3.4, -18.0], 'y': 1.4, 'label': '二つ目の電柱', 'size': 1,
     'text': ['電柱に、古い迷子の貼り紙の跡。日付だけが読める。「一九九八年 八月」。'],
     'feeling': '写真の裏と同じ年だ。'},
    {'id': 'TH_SHOPNOTE', 'room': 'SHOP_DOMA', 'position': [-9.9, -11.0], 'y': 1.3, 'label': '店の柱の張り紙', 'size': 1,
     'text': ['「夕方以降、畑の先で妙な声を聞いた方は、真似をせず、まっすぐ帰宅してください。　区長」'],
     'feeling': '「真似をせず」。声の真似のことか。'},
    {'id': 'TH_BUTSUDAN', 'room': 'IMA', 'position': [-11.9, 17.5], 'y': 1.0, 'label': '仏壇', 'size': 1,
     'text': ['仏壇の扉が開いている。位牌が一つ、裏返しに置かれている。', '裏返しの位牌には、触らないことにした。'],
     'feeling': '誰の位牌なのか、祖父に聞けなかった。'},
    {'id': 'TH_HASHIRA', 'room': 'IMA', 'position': [-4.8, 13.2], 'y': 1.3, 'label': '柱の背比べの傷', 'size': 1,
     'text': ['柱に、子どもの背を刻んだ傷が並んでいる。私の名前、母の名前。', 'いちばん上の傷だけ、名前がない。鴨居より高い。'],
     'feeling': '誰が、あの高さに傷をつけたのだろう。'},
    {'id': 'TH_KAKEJIKU', 'room': 'IMA', 'position': [-9.6, 18.5], 'y': 1.6, 'label': '掛け軸「静」', 'size': 1,
     'text': ['床の間の掛け軸。一文字だけ「静」。'],
     'feeling': '静かにしていろ、という意味に見えてくる。'},
    {'id': 'TH_KAMADO', 'room': 'DAIDOKORO', 'position': [-15.6, 17.7], 'y': 0.9, 'label': 'かまど', 'size': 1,
     'text': ['まだ温かい。鍋が二つ。祖母が夕飯を作りかけていたようだ。'],
     'feeling': 'おばあちゃんは、どこへ行ったんだろう。'},
    {'id': 'TH_CLOCK', 'room': 'ZASHIKI', 'position': [-4.4, 6.6], 'y': 2.0, 'label': '座敷の柱時計', 'size': 1,
     'text': ['文字盤の「七」に、赤い印がつけてある。', '七時までは、開けない。'],
     'feeling': '誰かが、何度も同じ夜を数えた印だ。'},
    {'id': 'TH_SHED', 'room': 'O_GARDEN', 'position': [-22.6, 22.0], 'y': 1.2, 'label': '物置小屋', 'size': 1,
     'text': ['薪と農具。戸の内側に、塩の袋の空き袋がたくさん畳んである。'],
     'feeling': '毎年の夏、ここで塩を使ってきたのか。'},
    {'id': 'TH_SHRINE', 'room': 'O_SHRINE', 'position': [13.0, -12.9], 'y': 1.3, 'label': '社の祠', 'photo': P + 'encounter.webp', 'size': 1,
     'text': ['祠の中に、札と同じ「身代守」の字。紙が新しい。', '紙の端に、小さく「名を呼ばれても　返事をしてはいけない」。'],
     'feeling': 'Ｋさんは、ここにも来ていた。'},
    {'id': 'TH_JIZO', 'room': 'O_FRONT', 'position': [3.6, 25.4], 'y': 0.8, 'label': '南の地蔵', 'size': 1,
     'text': ['道端の地蔵。前掛けが新しい。足元に、白い塩。'],
     'feeling': '村の四方に、同じ地蔵があるらしい。'},
]

# ---------------------------------------------------------------- endings (S18 + epilogue)
endings = [
    {'id': 'E_REMEMBERED', 'title': '写真を持って', 'kind': 'good', 'kicker': '生還 ― 三つの記録を持ち帰った', 'photo': P + 'grandfather-house.webp',
     'requires': {'tasks': ['T_RIDE'], 'flags': ['records_all']},
     'text': '村境を越えたあと、母に古い写真と祖母の手紙を渡した。母は写真の裏を読み、「これを、まだ取ってあったんだ」と言った。\n祖父母はその秋、町の小さな家へ移った。退治できたわけではない。ただ、誰もあの家に帰らずに済むようになった。\n引っ越しの日、祖父は玄関に四人分の靴をそろえた。全部、外へ向けて。\n古い家の片付けだけは、いまも業者に頼んでいない。私たちは、鍵の場所を知っている。'},
    {'id': 'E_SAFE', 'title': '帰れない家', 'kind': 'normal', 'kicker': '生還 ― 境を越えた', 'photo': P + 'grandfather-house.webp',
     'requires': {'tasks': ['T_RIDE']},
     'text': '車が地蔵の横を過ぎると、窓を叩く音が途切れた。\nＫさんは町のコンビニで初めて停車した。母が待っていた。祖父母は無事だという。私は渡されたお茶のふたを、しばらく開けられなかった。\nそれから、祖父母とは町で会うようになった。法事も、家には帰らなかった。\n毎年届く桃の箱には、必ず同じ一文が添えてある。\n「こちらには、取りに来なくていいからね」'},
]

# ---------------------------------------------------------------- the monster (standard pack; the look is the extension's 'hasshaku')
monsters = {
    'early': {'stages': 4},
    'hints': {'run': '走れ。', 'turn': '曲がって、生垣の陰へ。', 'hide': '隠れろ。'},
    'monsters': [{
        'id': 'hasshaku', 'look': 'dark-red-mist',  # replaced by the extension's 'hasshaku' look (js/ext/hasshaku.js)
        'phases': [{'preset': 'early'}],
        'activeFrom': {'stage': 'L4'},
        'spawn': {'room': 'O_SHRINE'}, 'route': 'village_loop',
        'nearAttack': {'room': 'O_ROAD', 'from': {'room': 'O_SHRINE'}, 'target': {'room': 'O_ROAD'}},
        'params': {'sight': 14},
    }],
}

# ---------------------------------------------------------------- release notes (Q10)
notes = {'version': '1.0.0', 'notes': [
    {'version': '1.0.0', 'date': '2026-10-31', 'title': '一人称の標準に載せ替えました', 'items': [
        {'type': 'new', 'text': '人物・家具・小物を、共通の3Dモデルに替えました。祖父の家と村の道も作り直しました。'},
        {'type': 'new', 'text': '手帳（Tab）で、所持品・目標とタスク・調べたもの・地図をいつでも見られます。'},
        {'type': 'new', 'text': '作業ごとに、短い手の作業（塩を盛る・窓をふさぐ・回し金を合わせる）を足しました。'},
        {'type': 'new', 'text': '家と村に、調べられる物を十二か所足しました。'},
        {'type': 'fix', 'text': '記録の名前と置き場所、札の場所、門の貼り紙の向きの食い違いを直しました。'},
        {'type': 'fix', 'text': '白い姿に見つかっても、落ち着いて走れば逃げ切れるようにしました。立ち止まると捕まります。'},
    ]},
]}

dump('stages.json', stages); dump('tasks.json', tasks); dump('items.json', items); dump('docs.json', docs)
dump('things.json', things); dump('endings.json', endings); dump('monsters.json', monsters); dump('release-notes.json', notes)
for f in ('terminals.json',):
    p = os.path.join(ROOT, 'data', f)
    if os.path.exists(p): os.remove(p); print('removed', f)

# ---------------------------------------------------------------- dialogue and timed lines (read by js/ext/story.js)
ME, GP, K, LADY = '私', '祖父', 'Ｋさん', '店のおばさん'
talk = {
    # S1 / S17: a short first-person opening (who, where, why tonight, what to do), then the errand
    'opening': [
        {'who': ME, 'text': '二〇〇八年、八月。夏休みに、母の代わりに祖父母の家へ来た。携帯の電波は、家の前の道でしか入らない。'},
        {'who': ME, 'text': '一泊して、明日の朝のバスで帰る。それだけの予定だった。'},
        {'who': GP, 'where': '玄関', 'img': P + 'grandfather-house.webp', 'text': 'おう、来たか。すまんが夕霧商店まで使いに行ってくれんか。醤油を一本、それと単三電池を四本。懐中電灯の電池が切れそうでな。'},
        {'who': ME, 'text': '夕霧商店？　子どもの頃に行った所だよね。ずいぶん長く帰ってなかったし、道を忘れたかも。'},
        {'who': GP, 'where': '玄関', 'img': P + 'route-map.webp', 'text': '玄関の外に地図を置いた。家を出て道なり、二つ目の電柱から左だ。社を越えた先に赤い看板がある。暗くなる前に戻ってくるんだぞ。'},
        {'who': ME, 'text': 'たかが買い物なのに、やけに念を押す。山が近いせいか、もう風が冷たい。'},
    ],
    'shop': [
        {'who': LADY, 'text': 'いらっしゃい。あら、あそこのお孫さんね。大きくなったこと。じいちゃん元気にしてるかい？'},
        {'who': ME, 'text': '元気ですよ。醤油一本と単三電池四本をください。'},
        {'who': LADY, 'text': '……帰りは、社のほうに寄らずにまっすぐ帰りな。最近ね、畑の先で変な声が聞こえるんだよ。鳥の声みたいで、でも鳥じゃない。'},
        {'who': ME, 'text': '「ぽ、ぽ、ぽ」ってやつ？　……そういえば来る途中、遠くで一度聞こえた気がする。'},
        {'who': LADY, 'text': 'その声を真似しちゃいけない。はい、醤油と電池。寄り道しないでね。'},
    ],
    'seen': '……ぽ、ぽ、ぽ。生垣の上に白い帽子がある。人が歩ける高さじゃない。私が見つめると、その帽子が止まった。',
    'genkan_first': '木戸が重い。ようやく開くと、畳と古い木の匂いがした。……家の奥で、誰かが歩いたような音がした。',
    'report': [
        {'who': GP, 'text': '買い物、ご苦労だったな。そこに置いて手を洗え。'},
        {'who': ME, 'img': P + 'encounter.webp', 'text': '途中で白い服の女の人を見たよ。生垣の上に帽子が出てた。脚立に乗ってたのかな。'},
        {'who': GP, 'text': '……どこの生垣だ。田んぼの方か。何か、声はしたか。'},
        {'who': ME, 'text': '低い音で、ぽ、ぽ、って。歩いてるのに、帽子の高さがずっと同じだった。'},
        {'who': GP, 'text': '今日は一人で出歩くな。Ｋさんを呼ぶ。迎えの車も、こっちで頼むから。'},
        {'who': ME, 'text': '知らない人が庭に入ったなら、警察に電話した方がいいんじゃない？'},
        {'who': GP, 'text': '駐在には俺から連絡する。今は、戸を閉めて部屋を用意しよう。'},
        {'who': GP, 'text': '台所に粗塩、納戸の机に新聞がある。札は、Ｋさんが仏壇の横に置いてくれた。'},
        {'who': GP, 'text': '北の座敷の四隅に塩を盛って、窓を新聞で塞ぐ。できたら、部屋の内側から襖に札を貼ってくれ。'},
        {'who': ME, 'text': 'さっきの人を見たって、それだけなんだけど。'},
        {'who': GP, 'text': 'そうだな。お前は何も悪くない。話は、手を動かしながらする。'},
    ],
    'prepared': [
        {'who': ME, 'text': '四隅に塩を置いた。窓も塞いだよ。札も貼った。'},
        {'who': K, 'where': '襖の外', 'text': 'あの女を、この辺では八尺様と呼んでいる。今夜は、その名前より手順を覚えて。'},
        {'who': K, 'where': '襖の外', 'text': '黒くなった皿を見つけたら、白い塩に替えて。時計が七時になったら、自分で戸を開ける。それより前は、私の声でも開けないで。'},
        {'who': GP, 'where': '襖の外', 'text': '時計が七時になったら、自分で戸を開けろ。それより前は、俺の声でも開けるな。'},
        {'who': ME, 'text': 'わかった。戸は開けない。時計と、塩だけ見る。'},
    ],
    'night_start': '時計は午前一時。七時まで、塩と戸を見ていればいい。',
    # [seconds of the night, speaker, text, effect]. The night is 150 s of play for 01:00 -> 07:00.
    'night': [
        [18, '戸の向こう', 'もういいぞ。開けてくれ。', 'knock'],
        [27, ME, '祖父の声だ。でも、七時にはまだ早い。', None],
        [55, '戸の向こう', 'お茶を持ってきた。冷めるぞ。', 'knock'],
        [67, ME, '北側の塩が、墨を落としたみたいに黒い。', None],
        [97, '窓の外', 'ぽ……ぽ、ぽ。', 'po'],
        [112, ME, '声が、窓のいちばん上からする。人の顔なら、真ん中に来るはずなのに。', None],
        [132, '戸の向こう', '顔だけ見せてくれ。', 'knockFinal'],
    ],
    'door_choice': {'who': '戸の外', 'text': '「こっちへ来い。もう迎えが来たぞ」\n祖父の声に聞こえる。けれど、時計はまだ七時前だ。',
                    'open': '返事をして、戸を開ける', 'keep': '約束を守り、開けない', 'kept': '返事はしない。まだ、七時になっていない。'},
    'dawn': [
        {'who': K, 'where': '襖の外', 'text': '七時だ。よく持ちこたえたね。'},
        {'who': ME, 'text': '夜中、おじいちゃんに呼ばれた。戸のすぐ外で。'},
        {'who': GP, 'text': '俺は一度も、あの戸の前へ行っていない。'},
        {'who': K, 'text': 'まだ終わっていないよ。北の農道の車止めを開けて、そのまま車へ。道の白い姿には近寄らないで。'},
        {'who': K, 'text': '車止めは、三つの回し金で留めてある。門柱の貼り紙どおりに合わせて。'},
        {'who': GP, 'text': '勝手口の閂は外しておいた。俺は家の戸を見ている。札を持って、村道を北へ行け。走ると、足音で気づかれるぞ。'},
        {'who': ME, 'text': 'もう外が明るいのに、庭からあの声がしている。'},
    ],
    'gate_opened': [
        {'who': ME, 'text': '回し金が外れた。車止めが上がる。'},
        {'who': K, 'where': '車の中', 'text': 'もう見えているよ。そのまま、右側の戸から乗って。'},
        {'who': ME, 'text': '後ろの足音が止まった。振り返らず、車の明かりを見る。'},
    ],
    'boarded': [
        {'who': K, 'where': '運転席', 'text': '戸を閉めるよ。札を、両手で持って。'},
        {'who': ME, 'text': 'ここまで来れば、大丈夫？'},
        {'who': K, 'where': '運転席', 'text': '村境を越すまで。私が止めるまで、外へ顔を向けないで。'},
        {'who': ME, 'text': '運転席のＫさんは前を向いたままだ。それなのに、同じ声がすぐ右の窓からした。'},
    ],
    'ride': [
        [5, '窓の外', 'ぽ……ぽ、ぽ。', 'po'],
        [12, '窓の外', '「忘れ物をしたぞ。こっちを向いてみろ」', 'knock'],
        [20, K, '前の地蔵が見えた。そのまま、札を離さないで。', 'knock'],
        [27, ME, '足音が……遠くなった。', None],
    ],
    'deaths': {
        'door': '朝七時より前に、戸を開けた。声が祖父に似ていても、時計と約束を信じよう。',
        'salt': '盛り塩を長く黒いままにして、部屋の守りが途切れた。黒ずんだ皿を見つけたら、近づいて [E] を押し続けて塩を替えよう。',
        'monster': '白い姿に追いつかれた。走ると音で気づかれやすい。見つかったら、立ち止まらずに走り、家や生垣を間に入れて視線を切ろう。',
        'window': '窓の外を見続け、声に引き寄せられた。[Space]・[E]、または「札を握る」を押し続けて目を伏せよう。',
    },
    'hints': {
        'items_first': '台所・納戸・居間を回って、塩と新聞と札を集める。手帳の「目標とタスク」に場所が書いてある。',
        'records': '家と村に、記録が三つ残っているらしい。読めば、この家のことがもう少し分かるかもしれない。',
    },
}
dump('talk.json', talk)
