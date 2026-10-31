# One-off generator of data/plan.json (the village and the grandfather's house). Edit here, then run:
#   python3 tools/authoring/make-plan.py
# Coordinates: metres, x east, z south (north = -z). A room is its min corner (x, z) and size (w, d).
import json, os

def room(id, name, x, z, w, d, kind='room', **k):
    return dict(id=id, name=name, x=x, z=z, w=w, d=d, kind=kind, **k)

rooms = [
    # the grandfather's house (x -20..-4, z 3..19): four rooms around a central hallway
    room('NANDO', '納戸', -20, 3, 7, 7.4, floorTex='planks_worn', wallTex='clay_wall', safe=True),
    room('ZASHIKI', '北の座敷', -13, 3, 9, 7.4, floorTex='tatami_weave_old', wallTex='clay_wall', safe=True),
    room('ROUKA', '中廊下', -20, 10.4, 16, 2, kind='corridor', floorTex='engawa_boards', wallTex='clay_wall', safe=True),
    room('DAIDOKORO', '台所', -20, 12.4, 7, 6.6, floorTex='planks_dark', wallTex='plaster_yellowed', safe=True),
    room('IMA', '居間', -13, 12.4, 9, 6.6, floorTex='tatami_weave', wallTex='clay_wall', safe=True),
    # 夕霧商店
    room('SHOP', '夕霧商店', -19, -18, 8, 9, floorTex='planks_grey_old', wallTex='panel_wood_wall', safe=True),
    room('SHOP_DOMA', '商店の土間', -11, -18, 2, 9, kind='corridor', floorTex='soil', wallTex='panel_wood_wall', safe=True),
    # outdoors (no walls: the extension turns the plan's outer edges into hedges, trees and fences)
    room('O_FRONT', '家の前の道', -4, -2, 9, 29, kind='outdoor', floorTex='gravel'),
    room('O_GARDEN', '裏庭', -26, 19, 22, 8, kind='outdoor', floorTex='soil'),
    room('O_BACK', '家の西', -26, -2, 6, 21, kind='outdoor', floorTex='grass_dry'),
    room('O_NORTH', '家の北', -20, -2, 16, 5, kind='outdoor', floorTex='moss'),
    room('O_FIELD', '田んぼの畦', 5, -2, 19, 29, kind='outdoor', floorTex='mud'),
    room('O_ROAD', '村道', -4, -24, 9, 22, kind='outdoor', floorTex='gravel'),
    room('O_SHOPFRONT', '商店の前', -9, -18, 5, 9, kind='outdoor', floorTex='gravel'),
    room('O_SHRINE', '道端の社', 5, -18, 13, 16, kind='outdoor', floorTex='moss'),
    room('O_GATE', '農道の先', -6, -46, 13, 22, kind='outdoor', floorTex='gravel'),
]

def door(id, a, b, x, z, width=1.0, **k):
    return dict(id=id, a=a, b=b, x=x, z=z, width=width, **k)

doors = [
    # house
    door('D_GENKAN', 'IMA', 'O_FRONT', -4, 15.6, 1.4, label='玄関の木戸'),
    door('D_IMA', 'IMA', 'ROUKA', -8.0, 12.4, 1.6, label='居間の障子'),
    door('D_KATTE', 'ROUKA', 'O_BACK', -20, 11.4, 1.1, label='勝手口', unlock='dawn', hint='勝手口は、外から閂が掛けてある。'),
    door('D_ENGAWA', 'ROUKA', 'O_FRONT', -4, 11.4, 1.2, label='縁側の戸'),
    door('D_DAIDOKORO', 'DAIDOKORO', 'ROUKA', -16.5, 12.4, 1.2, label='台所の引き戸', unlock='prep', hint='今は、居間の祖父に話すのが先だ。'),
    door('D_NANDO', 'NANDO', 'ROUKA', -16.5, 10.4, 1.2, label='納戸の障子戸', unlock='prep', hint='今は、居間の祖父に話すのが先だ。'),
    door('D_FUSUMA', 'ZASHIKI', 'ROUKA', -8.0, 10.4, 1.8, label='北の座敷の襖', unlock='prep', hint='北の座敷は閉め切ってある。今は、居間の祖父に話すのが先だ。'),
    # shop
    door('D_SHOP', 'SHOP_DOMA', 'O_SHOPFRONT', -9, -13.5, 1.6, label='商店の引き戸'),
    door('G_SHOP_DOMA', 'SHOP', 'SHOP_DOMA', -11, -13.5, 3.0, open=True),
    # outdoor openings (no panel; the extension removes it)
    door('G_FRONT_GARDEN', 'O_FRONT', 'O_GARDEN', -4, 23, 7.6, open=True),
    door('G_GARDEN_BACK', 'O_GARDEN', 'O_BACK', -23, 19, 5.6, open=True),
    door('G_BACK_NORTH', 'O_BACK', 'O_NORTH', -20, 0.5, 4.6, open=True),
    door('G_NORTH_FRONT', 'O_NORTH', 'O_FRONT', -4, 0.5, 4.6, open=True),
    door('G_FRONT_FIELD', 'O_FRONT', 'O_FIELD', 5, 3.5, 3.0, open=True),
    door('G_FRONT_FIELD2', 'O_FRONT', 'O_FIELD', 5, 24.5, 3.0, open=True),
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
    dict(id='S_BOWL_NW', room='ZASHIKI', x=-11.9, z=4.1, label='北西の皿'),
    dict(id='S_BOWL_NE', room='ZASHIKI', x=-5.1, z=4.1, label='北東の皿'),
    dict(id='S_BOWL_SW', room='ZASHIKI', x=-11.9, z=9.3, label='南西の皿'),
    dict(id='S_BOWL_SE', room='ZASHIKI', x=-5.1, z=9.3, label='南東の皿'),
    dict(id='S_WINDOW', room='ZASHIKI', x=-8.5, z=3.5, label='北の格子窓'),
    dict(id='S_SEAL', room='ZASHIKI', x=-8.0, z=9.95, label='襖の内側'),
    dict(id='S_CLOCK', room='ZASHIKI', x=-4.5, z=6.6, label='柱時計'),
    dict(id='S_GATE', room='O_ROAD', x=-1.6, z=-23.2, label='車止めの回し金'),
    dict(id='S_CAR', room='O_GATE', x=2.0, z=-33.5, label='迎えの車'),
]

hides = [
    dict(id='H_SHED', room='O_GARDEN', x=-23.6, z=23.4, label='物置小屋の陰'),
    dict(id='H_SHRINE', room='O_SHRINE', x=15.8, z=-15.6, label='社の裏'),
    dict(id='H_SHOPSIDE', room='O_SHOPFRONT', x=-6.3, z=-16.9, label='商店の軒下の樽の陰'),
    dict(id='H_BUSSTOP', room='O_ROAD', x=-3.0, z=-6.5, label='バス停の待合小屋'),
    dict(id='H_GATESHED', room='O_ROAD', x=-3.0, z=-20.6, label='車止めの脇の藁小屋'),
    dict(id='H_FIELDHUT', room='O_FIELD', x=21.5, z=-0.6, label='農具小屋'),
]

plan = dict(
    rooms=rooms, doors=doors, stations=stations, hides=hides,
    routes=[dict(id='village_loop', path=['O_ROAD', 'O_SHRINE', 'O_FIELD', 'O_FRONT', 'O_ROAD'])],
    start='O_FRONT', spawn=dict(x=-1.75, z=18.9, yaw=0),
    exits=['O_GATE', 'O_GARDEN'],
)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'plan.json')
json.dump(plan, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote', os.path.normpath(out), len(rooms), 'rooms', len(doors), 'doors')
