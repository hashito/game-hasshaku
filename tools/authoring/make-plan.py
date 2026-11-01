# One-off generator of data/plan.json (the village and the grandfather's house). Edit here, then run:
#   python -I tools/authoring/make-plan.py
# Coordinates: metres, x east, z south (north = -z). A room is its min corner (x, z) and size (w, d).
import json, os

def room(id, name, x, z, w, d, kind='room', **k):
    return dict(id=id, name=name, x=x, z=z, w=w, d=d, kind=kind, **k)

rooms = [
    # the grandfather's house (x -20..-4, z 3..19): four rooms, two by two, no hallway (Issue #4: easy to read)
    #   NANDO | ZASHIKI   (north)
    #   DAIDOKORO | IMA   (south; the entrance is on the east side of IMA)
    room('NANDO', '納戸', -20, 3, 8, 8, floorTex='planks_dark', wallTex='wall_clay_stained', safe=True),
    room('ZASHIKI', '北の座敷', -12, 3, 8, 8, floorTex='tatami_weave', wallTex='wall_clay_stained', safe=True),
    room('DAIDOKORO', '台所', -20, 11, 8, 8, floorTex='planks_dark', wallTex='wall_clay_stained', safe=True),
    room('IMA', '居間', -12, 11, 8, 8, floorTex='tatami_weave', wallTex='wall_clay_stained', safe=True),
    # 夕霧商店
    room('SHOP', '夕霧商店', -19, -18, 8, 9, floorTex='planks_grey_old', wallTex='panel_wood_wall', safe=True),
    room('SHOP_DOMA', '商店の土間', -11, -18, 2, 9, kind='corridor', floorTex='soil', wallTex='panel_wood_wall', safe=True),
    # outdoors: the kit keeps the wall colliders invisible; edge 'none' because js/ext/village.js dresses the edges itself (hedges, cedars, stone)
    room('O_FRONT', '家の前の道', -4, -2, 9, 29, kind='outdoor', floorTex='gravel', edge='none'),
    room('O_GARDEN', '裏庭', -26, 19, 22, 8, kind='outdoor', floorTex='soil', edge='none'),
    room('O_BACK', '家の西', -26, -2, 6, 21, kind='outdoor', floorTex='grass_dry', edge='none'),
    room('O_NORTH', '家の北', -20, -2, 16, 5, kind='outdoor', floorTex='moss', edge='none'),
    room('O_FIELD', '田んぼの畦', 5, -2, 13, 29, kind='outdoor', floorTex='mud', edge='none'),
    room('O_ROAD', '村道', -4, -24, 9, 22, kind='outdoor', floorTex='gravel', edge='none'),
    room('O_SHOPFRONT', '商店の前', -9, -18, 5, 9, kind='outdoor', floorTex='gravel', edge='none'),
    room('O_SHRINE', '道端の社', 5, -18, 13, 16, kind='outdoor', floorTex='moss', edge='none'),
    room('O_GATE', '農道の先', -6, -46, 13, 22, kind='outdoor', floorTex='gravel', edge='none'),
]

def door(id, a, b, x, z, width=1.0, **k):
    return dict(id=id, a=a, b=b, x=x, z=z, width=width, **k)

doors = [
    # house
    door('D_GENKAN', 'IMA', 'O_FRONT', -4, 15.6, 1.4, label='玄関の木戸'),
    door('D_FUSUMA', 'ZASHIKI', 'IMA', -8.0, 11, 1.8, label='北の座敷の襖', reason='minka: rooms open into each other through fusuma', unlock='prep', hint='北の座敷は閉め切ってある。今は、居間の祖父に話すのが先だ。'),
    door('D_DAIDOKORO', 'DAIDOKORO', 'IMA', -12, 15.0, 1.2, label='台所の引き戸', reason='minka: the kitchen opens off the living room', unlock='prep', hint='今は、居間の祖父に話すのが先だ。'),
    door('D_NANDO', 'NANDO', 'DAIDOKORO', -16.0, 11, 1.2, label='納戸の障子戸', reason='minka: the store room behind the kitchen', unlock='prep', hint='今は、居間の祖父に話すのが先だ。'),
    door('D_KATTE', 'DAIDOKORO', 'O_BACK', -20, 16.6, 1.1, label='勝手口', unlock='dawn', hint='勝手口は、外から閂が掛けてある。'),
    # shop
    door('D_SHOP', 'SHOP_DOMA', 'O_SHOPFRONT', -9, -13.5, 1.6, label='商店の引き戸'),
    door('G_SHOP_DOMA', 'SHOP', 'SHOP_DOMA', -11, -13.5, 3.0, open=True),
    # outdoor openings (no panel; the extension removes it)
    door('G_FRONT_GARDEN', 'O_FRONT', 'O_GARDEN', -4, 23, 7.6, open=True),
    door('G_GARDEN_BACK', 'O_GARDEN', 'O_BACK', -23, 19, 5.6, open=True),
    door('G_BACK_NORTH', 'O_BACK', 'O_NORTH', -20, 0.5, 4.6, open=True),
    door('G_NORTH_FRONT', 'O_NORTH', 'O_FRONT', -4, 0.5, 4.6, open=True),
    # the field lies open beside the road (Issue #4: no hedge round the field); only its two ends are closed
    door('G_FRONT_FIELD', 'O_FRONT', 'O_FIELD', 5, 12.5, 25.0, open=True),
    door('G_FRONT_ROAD', 'O_FRONT', 'O_ROAD', 0.5, -2, 8.6, open=True),
    door('G_ROAD_SHOPFRONT', 'O_ROAD', 'O_SHOPFRONT', -4, -13.5, 8.6, open=True),
    door('G_ROAD_SHRINE', 'O_ROAD', 'O_SHRINE', 5, -12, 4.0, open=True),
    door('G_SHRINE_FIELD', 'O_SHRINE', 'O_FIELD', 15.5, -2, 4.0, open=True),
    # the north gate of the farm road: opened by the task T_GATE (the extension holds it shut until then)
    door('D_GATE', 'O_ROAD', 'O_GATE', 0.5, -24, 6.2, label='農道の車止め', hint='車止めの回し金が掛かっている。三つの印を合わせれば開くはずだ。'),
]

stations = [
    dict(id='S_COUNTER', room='SHOP', x=-15.6, z=-13.5, label='帳場'),
    dict(id='S_GRANDPA', room='IMA', x=-6.4, z=16.4, label='祖父'),
    dict(id='S_BOWL_NW', room='ZASHIKI', x=-10.9, z=4.1, label='北西の皿'),
    dict(id='S_BOWL_NE', room='ZASHIKI', x=-5.1, z=4.1, label='北東の皿'),
    dict(id='S_BOWL_SW', room='ZASHIKI', x=-10.9, z=9.9, label='南西の皿'),
    dict(id='S_BOWL_SE', room='ZASHIKI', x=-5.1, z=9.9, label='南東の皿'),
    dict(id='S_WINDOW', room='ZASHIKI', x=-8.5, z=3.5, label='北の格子窓'),
    dict(id='S_SEAL', room='ZASHIKI', x=-8.0, z=10.55, label='襖の内側'),
    dict(id='S_CLOCK', room='ZASHIKI', x=-5.1, z=6.6, label='柱時計'),
    dict(id='S_GATE', room='O_ROAD', x=-1.6, z=-23.2, label='車止めの回し金'),
    dict(id='S_CAR', room='O_GATE', x=2.0, z=-33.5, label='迎えの車'),
]

hides = [
    dict(id='H_SHED', room='O_GARDEN', x=-23.6, z=23.4, label='物置小屋の陰'),
    dict(id='H_SHRINE', room='O_SHRINE', x=15.8, z=-15.6, label='社の裏'),
    dict(id='H_SHOPSIDE', room='O_SHOPFRONT', x=-6.3, z=-16.9, label='商店の軒下の樽の陰'),
    dict(id='H_BUSSTOP', room='O_ROAD', x=-3.0, z=-6.5, label='バス停の待合小屋'),
    dict(id='H_GATESHED', room='O_ROAD', x=-3.0, z=-20.6, label='車止めの脇の藁小屋'),
    dict(id='H_FIELDHUT', room='O_FIELD', x=16.4, z=25.6, label='農具小屋'),
    # Issue #4: more places to hide
    dict(id='H_WOODPILE', room='O_BACK', x=-24.4, z=7.0, label='薪の山の陰'),
    dict(id='H_STRAW', room='O_FIELD', x=17.0, z=11.6, label='稲藁の山の陰'),
    dict(id='H_AKIYA', room='O_GARDEN', x=-12.0, z=26.7, label='空き家の門の陰'),
]

plan = dict(
    rooms=rooms, doors=doors, stations=stations, hides=hides,
    routes=[dict(id='village_loop', path=['O_ROAD', 'O_SHRINE', 'O_FIELD', 'O_FRONT', 'O_ROAD'])],
    start='O_FRONT', spawn=dict(x=-1.75, z=18.9, yaw=0),
    exits=['O_GATE', 'O_GARDEN'],
    # an old farmhouse has no hallway: the rooms open into each other (Issue #4 asked for a plan that reads at a glance)
    checks=dict(ignore=['direct-total', 'no-corridor'], why='minka: four rooms two by two, no hallway'),
)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'plan.json')
json.dump(plan, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote', os.path.normpath(out), len(rooms), 'rooms', len(doors), 'doors')
