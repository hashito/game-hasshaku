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
        {'id': 'L1', 'name': '異影', 'title': '板塀の向こう', 'time': '十八時四十分', 'unlocks': ['village']},
        {'id': 'L2', 'name': '四隅', 'title': '今夜を越す部屋', 'time': '十九時十分', 'unlocks': ['prep']},
        {'id': 'L3', 'name': '呼び声', 'title': '朝になるまで、開けない', 'time': '深夜', 'unlocks': ['night']},
        {'id': 'L4', 'name': '迎えの道', 'title': '朝にも、まだいる', 'time': '午前七時', 'unlocks': ['dawn']},
        {'id': 'L5', 'name': '境越え', 'title': '窓の外を、確かめない', 'time': '午前七時八分', 'unlocks': ['border']},
    ],
    'unlocks': {
        'village': {'name': '村の道と夕霧商店', 'icon': 'map', 'desc': '最初から歩けます。地図は手帳（Tab）の「地図」でいつでも見られます。'},
        'prep': {'name': '家の奥の部屋', 'icon': 'door', 'desc': '祖父に話すと、台所・納戸・北の座敷に入れるようになります。'},
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
     'steps': steps(('家へ戻る', '来た道を南へ戻ります。田んぼの向こうに何か見えても、立ち止まらずに。', 'look', None),
                    ('居間の祖父に話す', '玄関の木戸を開けて、居間にいる祖父に話しかけます。', 'task', 'station:S_GRANDPA'))},
]
bowls = [('NW', '北西'), ('NE', '北東'), ('SW', '南西'), ('SE', '南東')]
for k, name in bowls:
    tasks.append({'id': f'T_SALT_{k}', 'title': f'{name}の皿に塩を盛る', 'stage': 'L2', 'room': 'ZASHIKI', 'station': f'S_BOWL_{k}',
                  'meaning': '座敷の四隅に塩を置くと、外のものが入りにくくなる、と祖父は言う。',
                  'hint': '粗塩の袋は台所の作業台にある。',
                  'minigame': {'type': 'salt', 'cfg': {'title': f'{name}の皿：塩を盛る', 'help': '押している間、塩が落ちます。線のところで離してください。', 'button': '押して塩を落とす', 'ok': 'ちょうどいい。白い山が、皿の真ん中に立った。', 'few': '少なすぎます。線まで盛ってください。'}},
                  'steps': steps(('台所で粗塩の袋を取る', '居間の西隣、台所の作業台にあります。', 'look', 'item:I_SALT'),
                                 (f'座敷の{name}の皿に塩を盛る', '座敷の四隅に、小さな皿が置いてあります。', 'task', f'station:S_BOWL_{k}'))})
tasks += [
    {'id': 'T_WINDOW', 'title': '座敷の窓を新聞紙でふさぐ', 'stage': 'L2', 'room': 'ZASHIKI', 'station': 'S_WINDOW',
     'meaning': '外から部屋の中が見えないようにする。中からも、外を見ないで済む。',
     'hint': '古い新聞は納戸の机にある。',
     'minigame': {'type': 'wipe', 'cfg': {'title': '北の格子窓：新聞紙を貼る', 'help': '窓をなぞって、新聞紙を端まで押さえてください。'}},
     'steps': steps(('納戸で新聞紙を取る', '台所の北隣、納戸の机の上です。', 'look', 'item:I_PAPER'),
                    ('北の格子窓をふさぐ', '座敷の北の窓です。', 'task', 'station:S_WINDOW'))},
    {'id': 'T_SEAL', 'title': '座敷の内側から、襖に札を貼る', 'stage': 'L2', 'room': 'ZASHIKI', 'station': 'S_SEAL',
     'needs': ['T_SALT_NW', 'T_SALT_NE', 'T_SALT_SW', 'T_SALT_SE', 'T_WINDOW'],
     'meaning': '札を戸に貼ると、朝まで部屋を守れる。もう一枚は身につけておく。',
     'hint': 'Ｋさんの札は、居間の仏壇の横に置いてある。',
     'minigame': {'type': 'align', 'cfg': {'title': '襖：札を貼る', 'item': '札', 'mark': '襖の合わせ目', 'help': '札を、襖の合わせ目にまっすぐ合わせてください。'}},
     'steps': steps(('居間の仏壇の横で札を受け取る', 'Ｋさんの札は二枚。一枚を戸に、もう一枚を手元に。', 'look', 'item:I_OFUDA'),
                    ('座敷に入り、襖の内側に札を貼る', '四隅の塩と窓の目張りが済んでから貼ります。', 'task', 'station:S_SEAL'))},
    {'id': 'T_DAWN', 'title': '朝七時まで、戸を開けずに塩を守る', 'stage': 'L3', 'room': 'ZASHIKI', 'station': 'S_CLOCK',
     'meaning': '七時になれば、Ｋさんが外から開けてくれる。それまでは、誰の声でも開けない。',
     'hint': '黒くなった皿があれば、近づいて塩を替える。',
     'steps': steps(('黒くなった塩を替える', '黒ずんだ皿に近づき、[E] を押し続けると白い塩に替えられます。', 'look', None),
                    ('七時まで戸を開けない', '声が聞こえても返事をしません。時計は画面の右上にあります。', 'task', None))},
    {'id': 'T_GATE', 'title': '北の農道の車止めを開ける', 'stage': 'L4', 'room': 'O_ROAD', 'station': 'S_GATE',
     'meaning': '迎えの車は、車止めの向こうで待っている。',
     'hint': '門柱の貼り紙を読む。三つの回し金を、左から順に合わせる。',
     'minigame': {'type': 'gate', 'cfg': {'title': '農道の車止め：三つの回し金', 'help': '金具を押すと、九十度ずつ回ります。左から順に、朝日が出る方・正午に日がある方・北の地蔵の方に合わせてください。', 'labels': ['朝日', '正午', '地蔵'], 'answer': [1, 2, 0], 'hint': '朝日は「東」、正午の日は「南」。最後は「北」。左から 東・南・北 に合わせます。', 'tryLabel': '留め具を外す', 'ok': '回し金が外れた。', 'bad': '留め具が引っかかる。向きがまだ合っていません。'}},
     'steps': steps(('家を出て、村道を北へ', '白い姿が道にいます。見つからないよう、建物や塀の陰を通ります。', 'look', None),
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
    {'id': 'I_LIGHT', 'name': '懐中電灯', 'photo': P + 'ph-flashlight.webp', 'desc': '祖父の家の懐中電灯。[F]（タッチは灯りのボタン）で点けたり消したりできます。',
     'why': '夜道と、家の暗い部屋を照らすため。', 'feeling': '電池が弱くなっている。だから買いに行くんだった。', 'room': 'O_FRONT', 'stage': 'L1', 'start': True},
    {'id': 'I_SALT', 'name': '粗塩の袋', 'photo': P + 'ph-salt-bag.webp', 'desc': '台所の作業台にあった粗塩。四隅の皿に盛り、黒ずんだら替える。',
     'why': '座敷の四隅を守るため。黒くなった塩を替える分もある。', 'feeling': '思ったより重い。何度も使ってきた袋だ。', 'room': 'DAIDOKORO', 'stage': 'L2', 'x': -17.0, 'z': 15.2, 'y': 0.86, 'kind': 'bag'},
    {'id': 'I_PAPER', 'name': '新聞紙（村の便り）', 'photo': P + 'ph-newspaper.webp', 'desc': '納戸の机に重ねてあった古い新聞。座敷の北の窓をふさぐのに使う。',
     'why': '外から部屋の中を見られないようにするため。', 'feeling': '「北の木戸は日没で閉鎖」。見出しが小さい。', 'room': 'NANDO', 'stage': 'L2', 'x': -17.0, 'z': 7.0, 'y': 0.76, 'kind': 'paper'},
    {'id': 'I_OFUDA', 'name': 'Ｋさんの札', 'photo': P + 'ph-ofuda.webp', 'desc': '「身代守」と書かれた札が二枚。一枚は襖に、もう一枚は手元に持つ。車の中では握りしめる。',
     'why': '朝まで部屋を守り、村境まで身を守るため。', 'feeling': '墨の匂いが新しい。今日、書いたばかりの札だ。', 'room': 'IMA', 'stage': 'L2', 'x': -10.3, 'z': 18.45, 'y': 0.4, 'kind': 'talisman'},
]

# ---------------------------------------------------------------- docs (the three records are the side quests, S9 / S13)
docs = [
    {'id': 'N_LETTER', 'photo': P + 'ph-letter.webp', 'title': '祖母の置き手紙', 'room': 'IMA', 'stage': 'L1', 'x': -8.4, 'z': 16.6, 'y': 0.34, 'kind': 'paper', 'record': True,
     'text': 'おかえり。ご飯は冷蔵庫にあります。\n北の部屋は掃除しておきました。窓際にある小さなお皿は捨てないでください。欠けているのもありますが、四枚そろっているのが大事なんだそうです。\n帰りのバスの時刻は古いので、電話で確かめること。お盆は一本少なくなっています。\n追伸。玄関の靴は、帰る向きにそろえておきました。',
     'feeling': '祖母の字だ。けれど、祖母の姿をまだ見ていない。'},
    {'id': 'N_PHOTO', 'photo': P + 'ph-family-photo.webp', 'title': '四人で写った写真', 'room': 'NANDO', 'stage': 'L2', 'x': -18.4, 'z': 9.4, 'y': 0.76, 'kind': 'photo', 'record': True,
     'text': '祖父と祖母、まだ小さかった私、その手を引く母。家の生垣の前で撮った写真だ。母だけが、カメラより高いところを見ている。\n写真の裏に、母の字で短く書いてある。\n「次に来るときは、必ず一緒に帰ること。私だけ先に帰らないこと」\n子供のころは、車酔いを心配して書いたのだと思っていた。',
     'feeling': '母が見上げている先に、生垣の上の何かが写っている気がする。'},
    {'id': 'N_DIARY', 'photo': P + 'ph-diary.webp', 'title': '道守りの覚え書き', 'room': 'O_SHRINE', 'stage': 'L1', 'x': 11.6, 'z': -13.05, 'y': 0.8, 'kind': 'book', 'record': True,
     'text': '八月二日。北の車止めを修繕。風で開かぬよう、三つの回し金を取り付けた。左から、朝日が出る方、正午に日がある方、北の地蔵の方に合わせる。すなわち「東・南・北」。門柱にも同じ説明を記す。\n四方の地蔵に破損なし。西の一体だけ、前掛けの結び目を直した。\n八月十日。県外へ出た者の帰省について問い合わせ。境を越えたら終わり、とは伝えないこと。出られた人を、また戻してはいけない。家の法事でも同じ。',
     'feeling': '「出られた人を、また戻してはいけない」。母は、だから帰ってこなかったのか。'},
    {'id': 'N_NOTICE', 'photo': P + 'ph-gate-notice.webp', 'title': '門柱の貼り紙', 'room': 'O_ROAD', 'stage': 'L4', 'x': -2.8, 'z': -23.6, 'y': 1.25, 'kind': 'paper',
     'text': '三つの回し金\n左から順に、朝日が出る方、正午に日がある方、北の地蔵の方。\nそれぞれの金具を押すと、九十度ずつ回ります。\n（左から 東・南・北）',
     'feeling': '雨で滲んでいるが、読める。三つ目は「北」。'},
]

# ---------------------------------------------------------------- things to examine (S13: pieces of the past, U19: a separate thought)
things = [
    {'id': 'TH_MAPBOARD', 'room': 'O_FRONT', 'position': [-2.6, 17.6], 'y': 1.1, 'label': '玄関の外の地図板', 'photo': P + 'route-map.webp', 'size': 1,
     'text': ['祖父が描いた道の地図。家を出て北、二つ目の電柱から左。社を越えた先に赤い看板。', '地図は手帳（Tab）の「地図」でも見られる。'],
     'feeling': '裏道まで描いてある。たかが買い物なのに。'},
    {'id': 'TH_FENCE', 'room': 'O_FIELD', 'position': [17.55, 12.0], 'y': 1.2, 'label': '空き家の板塀', 'photo': P + 'ph-fence.webp', 'size': 1,
     'text': ['大人の背より高い板塀。向こうは空き家だ。', '塀の上に、何かが乗っていた跡はない。'],
     'feeling': 'あの帽子は、この塀の向こうを歩いていた。'},
    {'id': 'TH_POLE', 'room': 'O_ROAD', 'position': [-3.4, -18.0], 'y': 1.4, 'label': '二つ目の電柱', 'photo': P + 'ph-pole.webp', 'size': 1,
     'text': ['電柱に、古い迷子の貼り紙の跡。日付だけが読める。「一九九八年 八月」。'],
     'feeling': '写真の裏と同じ年だ。'},
    {'id': 'TH_SHOPNOTE', 'room': 'SHOP_DOMA', 'position': [-9.9, -11.0], 'y': 1.3, 'label': '店の柱の張り紙', 'photo': P + 'ph-shopnote.webp', 'size': 1,
     'text': ['「夕方以降、畑の先で妙な声を聞いた方は、真似をせず、まっすぐ帰宅してください。　区長」'],
     'feeling': '「真似をせず」。声の真似のことか。'},
    {'id': 'TH_BUTSUDAN', 'room': 'IMA', 'position': [-11.3, 17.5], 'y': 1.0, 'label': '仏壇', 'photo': P + 'ph-butsudan.webp', 'size': 1,
     'text': ['仏壇の扉が開いている。位牌が一つ、裏返しに置かれている。', '裏返しの位牌には、触らないことにした。'],
     'feeling': '誰の位牌なのか、祖父に聞けなかった。'},
    {'id': 'TH_HASHIRA', 'room': 'IMA', 'position': [-4.8, 13.2], 'y': 1.3, 'label': '柱の背比べの傷', 'photo': P + 'ph-hashira.webp', 'size': 1,
     'text': ['柱に、子どもの背を刻んだ傷が並んでいる。私の名前、母の名前。', 'いちばん上の傷だけ、名前がない。鴨居より高い。'],
     'feeling': '誰が、あの高さに傷をつけたのだろう。'},
    {'id': 'TH_KAKEJIKU', 'room': 'IMA', 'position': [-9.6, 18.15], 'y': 1.6, 'label': '掛け軸「静」', 'photo': P + 'ph-kakejiku.webp', 'size': 1,
     'text': ['床の間の掛け軸。一文字だけ「静」。'],
     'feeling': '静かにしていろ、という意味に見えてくる。'},
    {'id': 'TH_KAMADO', 'room': 'DAIDOKORO', 'position': [-15.6, 17.7], 'y': 0.9, 'label': 'かまど', 'photo': P + 'ph-kamado.webp', 'size': 1,
     'text': ['まだ温かい。鍋が二つ。祖母が夕飯を作りかけていたようだ。'],
     'feeling': 'おばあちゃんは、どこへ行ったんだろう。'},
    {'id': 'TH_CLOCK', 'room': 'ZASHIKI', 'position': [-4.4, 6.6], 'y': 2.0, 'label': '座敷の柱時計', 'photo': P + 'ph-clock.webp', 'size': 1,
     'text': ['文字盤の「七」に、赤い印がつけてある。', '七時までは、開けない。'],
     'feeling': '誰かが、何度も同じ夜を数えた印だ。'},
    {'id': 'TH_SHED', 'room': 'O_GARDEN', 'position': [-22.6, 22.0], 'y': 1.2, 'label': '物置小屋', 'photo': P + 'ph-shed.webp', 'size': 1,
     'text': ['薪と農具。戸の内側に、塩の袋の空き袋がたくさん畳んである。'],
     'feeling': '毎年の夏、ここで塩を使ってきたのか。'},
    {'id': 'TH_SHRINE', 'room': 'O_SHRINE', 'position': [13.3, -12.4], 'y': 1.3, 'label': '社の祠', 'photo': P + 'encounter.webp', 'size': 1,
     'text': ['祠の中に、札と同じ「身代守」の字。紙が新しい。', '紙の端に、小さく「名を呼ばれても　返事をしてはいけない」。'],
     'feeling': 'Ｋさんは、ここにも来ていた。'},
    {'id': 'TH_JIZO', 'room': 'O_FRONT', 'position': [3.6, 25.4], 'y': 0.8, 'label': '南の地蔵', 'photo': P + 'ph-jizo.webp', 'size': 1,
     'text': ['道端の地蔵。前掛けが新しい。足元に、白い塩。'],
     'feeling': '村の四方に、同じ地蔵があるらしい。'},
]

# ---------------------------------------------------------------- endings (S18 + epilogue)
endings = [
    {'id': 'E_REMEMBERED', 'title': '写真を持って', 'kind': 'good', 'kicker': '生還 ― 三つの記録を持ち帰った', 'photo': P + 'ph-ending-shoes.webp',
     'requires': {'tasks': ['T_RIDE'], 'flags': ['records_all']},
     'text': '村境を越えたあと、母に古い写真と祖母の手紙を渡した。母は写真の裏を読み、「これを、まだ取ってあったんだ」と言った。\n祖父母はその秋、町の小さな家へ移った。退治できたわけではない。ただ、誰もあの家に帰らずに済むようになった。\n引っ越しの日、祖父は玄関に四人分の靴をそろえた。全部、外へ向けて。\n古い家の片付けだけは、いまも業者に頼んでいない。私たちは、鍵の場所を知っている。'},
    {'id': 'E_SAFE', 'title': '帰れない家', 'kind': 'normal', 'kicker': '生還 ― 境を越えた', 'photo': P + 'ph-ending-town.webp',
     'requires': {'tasks': ['T_RIDE']},
     'text': '車が地蔵の横を過ぎると、窓を叩く音が途切れた。\nＫさんは町のコンビニで初めて停車した。母が待っていた。祖父母は無事だという。私は渡されたお茶のふたを、しばらく開けられなかった。\nそれから、祖父母とは町で会うようになった。法事も、家には帰らなかった。\n毎年届く桃の箱には、必ず同じ一文が添えてある。\n「こちらには、取りに来なくていいからね」'},
]

# ---------------------------------------------------------------- the monster (standard pack; the look is the extension's 'hasshaku')
monsters = {
    'early': {'stages': 4},
    'hints': {'run': '走れ。', 'turn': '曲がって、物陰へ。', 'hide': '隠れろ。'},
    'monsters': [{
        'id': 'hasshaku', 'look': 'hasshaku',  # ext.registerLook (js/ext/hasshaku.js)
        'phases': [{'preset': 'early'}],
        'activeFrom': {'stage': 'L4'},
        'spawn': {'room': 'O_SHRINE'}, 'route': 'village_loop',
        'nearAttack': {'room': 'O_ROAD', 'from': {'room': 'O_SHRINE'}, 'target': {'room': 'O_ROAD'}},
        'params': {'sight': 14},
    }],
}

# ---------------------------------------------------------------- release notes (Q10)
notes = {'version': '1.1.9', 'notes': [
    {'version': '1.1.9', 'date': '2026-11-01', 'title': '読み込みを軽くし、最初の出会いとＫさんの到着を分かりやすくしました', 'items': [
        {'type': 'change', 'text': '写真と人物の絵を軽くしました（合計 約3.1MB → 約1.3MB）。始めるまでの読み込みが速くなります。'},
        {'type': 'change', 'text': '最初に白い帽子を見たとき、主人公がそちらへ振り向き、目が釘付けになるように寄って見えるようにしました。'},
        {'type': 'change', 'text': 'Ｋさんの到着：祖父が先に玄関の戸を閉め、閉じた戸が叩かれ、祖父が開けてＫさんを迎え入れる流れにしました。Ｋさんの姿も玄関に見えます。'}]},
    {'version': '1.1.8', 'date': '2026-11-01', 'title': '最初の説明に絵を付けました', 'items': [
        {'type': 'change', 'text': '最初の説明の各場面に写真を付けました（村のバス停、祖父の家、道の地図）。'},
        {'type': 'change', 'text': '塩を盛る・回し金を回すミニゲームを、ほかの作品でも使える共通の部品にしました。見た目は他の窓とそろえ、上寄せで開きます。'},
        {'type': 'fix', 'text': '会話の窓で、写真と台詞が狭い画面でもはみ出さないようにしました。'}]},
    {'version': '1.1.7', 'date': '2026-11-01', 'title': '最初の出会いとＫさんの到着、夜の罠を足しました', 'items': [
        {'type': 'fix', 'text': '最初に白い姿を見る場所を、田んぼの向こうの空き家の板塀にしました（生け垣はもうありません）。帽子だけが塀の上を動きます。前に生け垣があった場所の「調べる」も板塀に移しました。'},
        {'type': 'change', 'text': '最初の出会いを怖くしました。見つめると立ち止まってこちらを見たあと、塀沿いに近づいて沈み、すぐ近くで声がします。'},
        {'type': 'new', 'text': '祖父との話のあと、窓のすぐ外で声がして電灯が揺れ、玄関を叩く音のあとにＫさんが到着する場面を足しました。'},
        {'type': 'new', 'text': '夜に、部屋から出させようとする声を増やしました。七時になったと見せかけて、自分で開けさせようとすることもあります。'},
        {'type': 'change', 'text': '会話の窓で、話している人（祖父、Ｋさん、店のおばさん）の姿を毎回出すようにしました。'},
        {'type': 'change', 'text': '物を拾ったとき、その物の写真を出すようにしました。'},
        {'type': 'fix', 'text': 'バス停の待合小屋と車止めの脇の藁小屋の向きを直しました。中に隠れると出られなかったのを直しました。'},
        {'type': 'change', 'text': '環境音と曲の音量を下げ、声や足音が聞き取りやすくなるようにしました。'}]},
    {'version': '1.1.6', 'date': '2026-11-01', 'title': '窓の位置をそろえました', 'items': [
        {'type': 'change', 'text': '続けて開く窓（作業の確認、資料、選択肢、手帳など）の上端が同じ位置にそろい、途中で下がらなくなりました。'},
        {'type': 'change', 'text': '文章だけの窓は文の長さに合わせた高さになり、大きな空白の箱が出なくなりました。'},
        {'type': 'fix', 'text': '車止めの脇の藁小屋を車止めに少し近づけ、農道の車止めの前で見つかっても隠れに行けるようにしました。'}]},
    {'version': '1.1.5', 'date': '2026-11-01', 'title': '村の境と隠れ場所を分かりやすくしました', 'items': [
        {'type': 'change', 'text': '田んぼの囲いの生け垣をなくし、道から開けた田んぼにしました。田んぼの東と裏庭の南には、板塀で囲った空き家があります。'},
        {'type': 'change', 'text': '村の外れに低い石垣を巡らせ、行ける範囲が見て分かるようにしました。田んぼも少し狭くしました。'},
        {'type': 'new', 'text': '隠れ場所を三つ増やしました（薪の山の陰、稲藁の山の陰、空き家の門の陰）。'},
        {'type': 'fix', 'text': '生け垣や小屋の壁を通り抜けられたのを直しました。木や石、柱、藁、布団などにも質感を付けました（共通の軽い素材集を使っています）。'},
        {'type': 'new', 'text': '会話の画面に、祖父とＫさんの姿が出るようにしました。'},
    ]},
    {'version': '1.1.4', 'date': '2026-10-31', 'title': '夕霧商店を村の商店らしくしました', 'items': [
        {'type': 'change', 'text': '棚に瓶・缶・袋の品物と値札を並べ、ガラスの陳列台の帳場、冷たい飲みものの冷蔵ケース、氷のケース、野菜の箱を置きました。'},
        {'type': 'change', 'text': '店の入口に暖簾を掛け、表に自動販売機を置きました。'},
        {'type': 'fix', 'text': '朝になると、祖父が居間から北の座敷の襖を開けておくようにしました。'},
    ]},
    {'version': '1.1.3', 'date': '2026-10-31', 'title': '祖父の家を作り直しました', 'items': [
        {'type': 'change', 'text': '祖父の家の廊下をなくし、四つの部屋が田の字に並ぶ間取りにしました。'},
        {'type': 'fix', 'text': '床が石の色に隠れていたのを直し、畳を縁のある一枚ずつの畳にしました。天井を板張りにし、鴨居と柱を付けました。'},
        {'type': 'fix', 'text': '扉の上が空いて外の杉が見えていたのと、屋根の瓦が部屋の中に見えていたのを直しました。'},
        {'type': 'fix', 'text': '家の角から生け垣が部屋の中に突き出していたのを直しました。'},
        {'type': 'change', 'text': '家と商店の棚や机を木の色にそろえ、天井の照明のまぶしさを抑えました。'},
    ]},
    {'version': '1.1.2', 'date': '2026-10-31', 'title': '横向きのスマートフォンで表示を直しました', 'items': [
        {'type': 'fix', 'text': '横向きのスマートフォンで、タイトル画面の上下が切れていたのを直しました。'},
        {'type': 'fix', 'text': '操作の説明の言い回しをそろえました。'},
    ]},
    {'version': '1.1.1', 'date': '2026-10-31', 'title': '始めたときの止まりを直しました', 'items': [
        {'type': 'fix', 'text': '「はじめる」を押した直後や夜の場面で、数秒間画面が止まることがあったのを直しました（読み込み中に準備するようにしました）。'},
    ]},
    {'version': '1.1.0', 'date': '2026-10-31', 'title': '声と写真と音が付きました', 'items': [
        {'type': 'new', 'text': '祖父・Ｋさん・店のおばさん、そして戸や窓の向こうの声に、音声が付きました（字幕はそのまま）。'},
        {'type': 'new', 'text': '所持品・記録・調べられる物・結末に、写真を付けました。'},
        {'type': 'new', 'text': '夕暮れの村、夜の虫、霧の朝、車の中の環境音と、タイトルの曲を付けました。戸を閉めると音がこもります。'},
        {'type': 'new', 'text': '瓦屋根・田んぼ・畦・砂利道・障子・襖・塩の皿・足跡の見た目を作り直しました。'},
    ]},
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
        {'img': P + 'ph-arrival.webp', 'who': ME, 'text': '二〇〇八年、八月。夏休みに、母の代わりに祖父母の家へ来た。携帯の電波は、家の前の道でしか入らない。'},
        {'img': P + 'ph-arrival.webp', 'who': ME, 'text': '一泊して、明日の朝のバスで帰る。それだけの予定だった。'},
        {'who': GP, 'where': '玄関', 'img': P + 'grandfather-house.webp', 'text': 'おう、来たか。すまんが夕霧商店まで使いに行ってくれんか。醤油を一本、それと単三電池を四本。懐中電灯の電池が切れそうでな。'},
        {'img': P + 'grandfather-house.webp', 'who': ME, 'text': '夕霧商店？　子どもの頃に行った所だよね。ずいぶん長く帰ってなかったし、道を忘れたかも。'},
        {'who': GP, 'where': '玄関', 'img': P + 'route-map.webp', 'text': '玄関の外に地図を置いた。家を出て道なり、二つ目の電柱から左だ。社を越えた先に赤い看板がある。暗くなる前に戻ってくるんだぞ。'},
        {'img': P + 'ph-arrival.webp', 'who': ME, 'text': 'たかが買い物なのに、やけに念を押す。山が近いせいか、もう風が冷たい。'},
    ],
    'shop': [
        {'who': LADY, 'img': P + 'ph-shop-inside.webp', 'text': 'いらっしゃい。あら、あそこのお孫さんね。大きくなったこと。じいちゃん元気にしてるかい？'},
        {'who': ME, 'text': '元気ですよ。醤油一本と単三電池四本をください。'},
        {'who': LADY, 'text': '……帰りは、社のほうに寄らずにまっすぐ帰りな。最近ね、畑の先で変な声が聞こえるんだよ。鳥の声みたいで、でも鳥じゃない。'},
        {'who': ME, 'text': '「ぽ、ぽ、ぽ」ってやつ？　……そういえば来る途中、遠くで一度聞こえた気がする。'},
        {'who': LADY, 'img': P + 'ph-goods.webp', 'text': 'その声を真似しちゃいけない。はい、醤油と電池。寄り道しないでね。'},
    ],
    'seen': '……ぽ、ぽ、ぽ。田んぼの向こう、空き家の板塀の上に白い帽子がある。人が歩ける高さじゃない。私が見つめると、その帽子が止まった。',
    'seen_near': '……すぐ近くで、ぽ、と鳴った。塀の上に、もう帽子は見えない。どこへ行った。',
    'genkan_first': '木戸が重い。ようやく開くと、畳と古い木の匂いがした。……家の奥で、誰かが歩いたような音がした。',
    'report': [
        {'who': GP, 'text': '買い物、ご苦労だったな。そこに置いて手を洗え。'},
        {'who': ME, 'img': P + 'encounter.webp', 'text': '途中で白い服の女の人を見たよ。田んぼの向こうの塀の上に帽子が出てた。脚立に乗ってたのかな。'},
        {'who': GP, 'text': '……田んぼの向こうの、空き家の塀か。何か、声はしたか。'},
        {'who': ME, 'text': '低い音で、ぽ、ぽ、って。歩いてるのに、帽子の高さがずっと同じだった。'},
        {'who': GP, 'text': '今日は一人で出歩くな。Ｋさんを呼ぶ。迎えの車も、こっちで頼むから。'},
        {'who': ME, 'text': '知らない人が庭に入ったなら、警察に電話した方がいいんじゃない？'},
        {'who': GP, 'text': '駐在には俺から連絡する。今は、戸を閉めて部屋を用意しよう。'},
    ],
    # after the report: the po right outside the window and the lamp flickering (js/ext/story.js), then a knock at the front door
    # the front door is shut by the grandfather first, so the knock comes at a closed door (user: the open door made it unclear)
    'gp_shut': '祖父が玄関の戸を閉めて、心張り棒をかけた。',
    'scare_window': '……窓のすぐ外で、ぽ、と鳴った。電灯が揺れている。祖父が、声を出すなと手で示した。',
    'k_enter': '祖父が心張り棒を外して、玄関の戸を細く開けた。札の束を抱えた女の人が滑り込み、祖父はすぐに戸を閉めた。',
    'k_arrive': [
        {'who': GP, 'where': '居間', 'text': '……誰だ。'},
        {'who': K, 'where': '玄関の戸の向こう', 'text': 'Ｋです。札を持ってきました。開けてください。'},
        {'who': GP, 'where': '居間', 'text': '……声も、叩き方もＫさんだ。開けるぞ。'},
        {'who': K, 'where': '玄関', 'text': '間に合ってよかった。もう、家の周りを歩いています。窓の外は見ないで。'},
        {'who': ME, 'text': 'あの人、何なんですか。さっき、塀の上に帽子が……'},
        {'who': K, 'where': '居間', 'text': '話は後で。札を二枚、仏壇の横に置きます。一枚は座敷の戸に、一枚はあなたの手元に。'},
    ],
    'report_after': [
        {'who': GP, 'text': '台所に粗塩、納戸の机に新聞がある。札は、いまＫさんが仏壇の横に置いてくれた。'},
        {'who': GP, 'text': '北の座敷の四隅に塩を盛って、窓を新聞で塞ぐ。できたら、部屋の内側から襖に札を貼ってくれ。'},
        {'who': ME, 'text': 'さっきの人を見たって、それだけなんだけど。'},
        {'who': GP, 'text': 'そうだな。お前は何も悪くない。話は、手を動かしながらする。'},
    ],
    'prepared': [
        {'who': ME, 'text': '四隅に塩を置いた。窓も塞いだよ。札も貼った。'},
        {'who': K, 'where': '襖の外', 'text': 'あの女を、この辺では八尺様と呼んでいる。今夜は、その名前より手順を覚えて。'},
        {'who': K, 'where': '襖の外', 'text': '黒くなった皿を見つけたら、白い塩に替えて。七時になったら、私が外から声をかけて、こちらから襖を開ける。あなたが開けることはない。'},
        {'who': GP, 'where': '襖の外', 'text': '開けてくれと言う声がしたら、それは俺でもＫさんでもない。誰の声でも、開けるな。'},
        {'who': ME, 'text': 'わかった。こっちからは開けない。時計と、塩だけ見る。'},
    ],
    'night_start': '時計は午前一時。七時まで、塩と戸を見ていればいい。',
    # [seconds of the night, speaker, text, effect]. The night is 150 s of play for 01:00 -> 07:00.
    'night': [
        [18, '戸の向こう', 'もういいぞ。開けてくれ。', 'knock'],
        [27, ME, '祖父の声だ。でも、七時にはまだ早い。', None],
        [40, 'Ｋさんの声', 'Ｋです。お祖父さんが倒れたの。手を貸して。……開けて。', 'knock'],
        [46, ME, 'Ｋさんは、こちらから開けると言った。開けてとは、言わないはずだ。', None],
        [55, '戸の向こう', 'お茶を持ってきた。冷めるぞ。', 'knock'],
        [67, ME, '北側の塩が、墨を落としたみたいに黒い。', None],
        [97, '窓の外', 'ぽ……ぽ、ぽ。', 'po'],
        [112, ME, '声が、窓のいちばん上からする。人の顔なら、真ん中に来るはずなのに。', None],
        [122, '戸の向こう', '顔だけ見せてくれ。', 'knockFinal'],
        # the fake end (Issue #4): the clock shows seven, the voice says it is over and asks YOU to open; then the clock slips back
        [131, 'Ｋさんの声', '七時になりました。もう終わり。……さあ、自分で開けて出てきて。', 'fakeDawn'],
        [137, ME, '時計は七時を指している。……でも、Ｋさんは「こちらから開ける」と言った。', None],
        [143, ME, '……時計が、六時五十八分に戻っている。', 'fakeEnd'],
    ],
    'door_choice': {'who': '戸の外', 'text': '「こっちへ来い。もう迎えが来たぞ」\n祖父の声に聞こえる。けれど、時計はまだ七時前だ。',
                    'open': '返事をして、戸を開ける', 'keep': '約束を守り、開けない', 'kept': '返事はしない。まだ、七時になっていない。'},
    'dawn': [
        {'who': K, 'where': '襖の外', 'img': P + 'ph-dawn-road.webp', 'text': '七時だ。よく持ちこたえたね。'},
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
        'monster': '白い姿に追いつかれた。走ると音で気づかれやすい。見つかったら、立ち止まらずに走り、家や塀を間に入れて視線を切ろう。',
        'window': '窓の外を見続け、声に引き寄せられた。[Space]・[E]、または「札を握る」を押し続けて目を伏せよう。',
    },
    'hints': {
        'items_first': '台所・納戸・居間を回って、塩と新聞と札を集める。手帳の「目標とタスク」に場所が書いてある。',
        'records': '家と村に、記録が三つ残っているらしい。読めば、この家のことがもう少し分かるかもしれない。',
    },
}
# Issue #4: the grandfather and Ｋさん are shown in the talk window - their first line of each conversation carries their portrait
# the speakers' faces are game.json "portraits" (the kit shows them beside every line they say)
dump('talk.json', talk)
