"""Omni AI Canvas 인포그래픽과 도표를 다시 만든다.

python3 docs/diagrams/brand/build.py  (ZTD Charts 렌더에는 npx가 필요하다)
Diagram Design: omni-board(dp-integration), dialogue-steps(steps), node-kinds(layers), timeline-anatomy(timeline), sheet-grid(exploded). ZTD Charts: bar 다섯 개.
"""
import html, pathlib, re, subprocess, tempfile

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "public/guide"
PAPER, INK, MUTED, RULE, ACCENT, ACCENT_TEXT, TINT = "#ffffff", "#1a1c20", "#555d6d", "#d1d3d8", "#ff6600", "#b93901", "#fff2ec"
FONT = "Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif"


def text(x, y, value, size=20, weight=400, fill=INK, anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{html.escape(value)}</text>'


def box(x, y, w, h, fill=PAPER, stroke=RULE, width=1.5):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def arrow(x1, y1, x2, y2, color=MUTED):
    head = f"{x2-10},{y2-6} {x2},{y2} {x2-10},{y2+6}" if y1 == y2 else f"{x2-6},{y2-10} {x2},{y2} {x2+6},{y2-10}"
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="2" fill="none"/><polyline points="{head}" fill="none" stroke="{color}" stroke-width="2"/>'


def svg(name, w, h, title, desc, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="{name}-title {name}-desc" font-family="{FONT}"><title id="{name}-title">{title}</title>'
            f'<desc id="{name}-desc">{desc}</desc><rect width="{w}" height="{h}" fill="{PAPER}"/>' + "".join(body) + "</svg>")


SOURCES = [
    ("글과 기획", ["Codex · Claude · Antigravity"]),
    ("이미지", ["Codex · Higgsfield · Kling · Topview", "OpenAI · Gemini · Seedream"]),
    ("영상", ["Higgsfield · Kling · Topview"]),
    ("대사 음성", ["Fish Audio · ElevenLabs · Typecast", "Gemini · 내 컴퓨터"]),
    ("음악과 효과음", ["Road Music"]),
    ("3D 장면", ["Blender · Tripo"]),
]
BOARD = ["대본과 인물", "키프레임과 연출 후보", "고른 영상", "대사 음성과 음향"]
RESULTS = [("완성 영상", ["타임라인 · MP4 · SRT"]), ("다음 작품", ["보드 프리셋 · 자산 보관함"])]
B_TITLE, B_SUB = "여러 AI 모델을 한 보드에서 써요", "어떤 모델을 써도 자료와 고른 결과가 한 보드에 남아요"
B_DESC = "글과 기획, 이미지, 영상, 대사 음성, 음악과 효과음, 3D 장면에 쓰는 도구가 보드 하나에 모이고 그 자료로 완성 영상과 다음 작품을 만듭니다."


def board_wide():
    b = [text(64, 72, B_TITLE, 34, 700), text(64, 108, B_SUB, 20, 400, MUTED)]
    for i, (name, lines) in enumerate(SOURCES):
        y = 148 + i * 88
        b += [box(64, y, 424, 72), text(84, y + 43, name, 20, 700)]
        first = y + 43 if len(lines) == 1 else y + 31
        b += [text(468, first + k * 24, line, 15, 400, MUTED, "end") for k, line in enumerate(lines)]
        b.append(arrow(488, y + 36, 560, y + 36))
    b += [box(568, 148, 288, 512, TINT, ACCENT, 3), text(712, 216, "보드", 28, 700, ACCENT_TEXT, "middle")]
    for i, line in enumerate(BOARD):
        y = 256 + i * 92
        b += [box(600, y, 224, 64), text(712, y + 39, line, 18, 600, INK, "middle")]
    for i, (name, lines) in enumerate(RESULTS):
        y = 256 + i * 184
        b += [arrow(856, y + 56, 928, y + 56), box(936, y, 280, 112), text(960, y + 48, name, 22, 700), text(960, y + 82, lines[0], 16, 400, MUTED)]
    return svg("omni-board", 1280, 712, B_TITLE, B_DESC, b)


def board_narrow():
    b = [text(32, 64, B_TITLE, 34, 700), text(32, 104, "어떤 모델을 써도", 22, 400, MUTED), text(32, 134, "자료와 고른 결과가 한 보드에 남아요", 22, 400, MUTED)]
    y = 164
    for name, lines in SOURCES:
        h = 72 + 30 * len(lines)
        b += [box(32, y, 576, h), text(56, y + 42, name, 26, 700)]
        b += [text(56, y + 78 + 30 * k, line, 22, 400, MUTED) for k, line in enumerate(lines)]
        y += h + 12
    b += [arrow(320, y, 320, y + 48), box(32, y + 60, 576, 336, TINT, ACCENT, 3), text(320, y + 112, "보드", 30, 700, ACCENT_TEXT, "middle")]
    for i, line in enumerate(BOARD):
        b += [box(64, y + 136 + i * 62, 512, 50), text(320, y + 169 + i * 62, line, 23, 600, INK, "middle")]
    y += 396
    b.append(arrow(320, y, 320, y + 48))
    for i, (name, lines) in enumerate(RESULTS):
        yy = y + 60 + i * 112
        b += [box(32, yy, 576, 100), text(56, yy + 42, name, 26, 700), text(56, yy + 78, lines[0], 22, 400, MUTED)]
    return svg("omni-board-narrow", 640, y + 296, B_TITLE, B_DESC, b)


STEPS = [
    ("대사 노드", ["대본을 붙여 넣거나", "직접 적어요"]),
    ("화자 나누기", ["줄마다 화자 이름이", "색 태그로 붙어요"]),
    ("목소리 고르기", ["화자마다 목소리를", "정해요"]),
    ("AI 연기 지시", ["줄마다 말투와 쉼,", "소리를 제안해요"]),
    ("만들고 듣기", ["마음에 안 드는 줄만", "다시 만들어요"]),
    ("타임라인", ["고른 음성을", "컷에 넣어요"]),
]
FOCAL = 3
S_TITLE, S_SUB = "대사를 음성으로 만드는 순서", "대본을 줄 단위로 다듬어 컷에 넣어요"
S_DESC = "대사 노드에서 화자를 나누고 목소리를 고른 다음, AI 연기 지시를 검토하고 음성을 만들어 타임라인에 넣는 여섯 단계입니다."


def steps_wide():
    b = [text(80, 84, S_TITLE, 34, 700), text(80, 122, S_SUB, 20, 400, MUTED)]
    w = 184
    start = (1280 - w * len(STEPS)) // 2
    for i, (name, lines) in enumerate(STEPS):
        x, cx, focal = start + i * w, start + i * w + w // 2, i == FOCAL
        fill, op = (ACCENT, .16) if focal else (INK, .05 if i % 2 == 0 else .09)
        b.append(f'<rect x="{x}" y="200" width="{w}" height="48" fill="{fill}" fill-opacity="{op}" data-role="rail" data-step="s{i+1}" data-index="{i+1}"{" data-focal=\'true\'" if focal else ""}/>')
    for i, (name, lines) in enumerate(STEPS):
        cx, focal = start + i * w + w // 2, i == FOCAL
        c = ACCENT_TEXT if focal else INK
        b.append(f'<circle cx="{cx}" cy="224" r="36" fill="{PAPER}" stroke="{ACCENT if focal else INK}" stroke-width="{3 if focal else 1.5}" data-role="medallion" data-step="s{i+1}"{" data-focal=\'true\'" if focal else ""}/>')
        b.append(f'<text x="{cx}" y="231" font-size="20" font-weight="700" fill="{c}" text-anchor="middle" data-role="number" data-step="s{i+1}">0{i+1}</text>')
        b.append(text(cx, 308, name, 23, 700, c, "middle"))
        b += [text(cx, 344 + 26 * k, line, 18, 400, MUTED, "middle") for k, line in enumerate(lines)]
    return svg("dialogue-steps", 1280, 424, S_TITLE, S_DESC, b)


def steps_narrow():
    b = [text(32, 64, S_TITLE, 34, 700), text(32, 104, "대본을 줄 단위로", 22, 400, MUTED), text(32, 134, "다듬어 컷에 넣어요", 22, 400, MUTED)]
    top, gap = 172, 124
    b.append(f'<rect x="60" y="{top+36}" width="16" height="{gap*(len(STEPS)-1)}" fill="{INK}" fill-opacity=".08"/>')
    for i, (name, lines) in enumerate(STEPS):
        cy, focal = top + 36 + gap * i, i == FOCAL
        c = ACCENT_TEXT if focal else INK
        b.append(f'<circle cx="68" cy="{cy}" r="36" fill="{PAPER}" stroke="{ACCENT if focal else INK}" stroke-width="{3 if focal else 1.5}"/>')
        b += [text(68, cy + 8, f"0{i+1}", 22, 700, c, "middle"), text(132, cy - 4, name, 27, 700, c), text(132, cy + 32, " ".join(lines), 22, 400, MUTED)]
    return svg("dialogue-steps-narrow", 640, top + 72 + gap * (len(STEPS) - 1) + 40, S_TITLE, S_DESC, b)


def write_diagram(name, wide, narrow):
    (OUT / f"{name}.svg").write_text(wide)
    (OUT / f"{name}-narrow.svg").write_text(narrow)
    (HERE / f"{name}.html").write_text(
        f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name}</title>'
        '<style>body{margin:0;padding:24px;background:#f3f4f5}svg{display:block;max-width:100%;height:auto;margin:0 auto 24px}</style></head>'
        f'<body>{wide}{narrow}</body></html>')


def write_chart(name):
    for suffix, width in (("", 720), ("-narrow", 360)):
        target = pathlib.Path(tempfile.mkdtemp()) / "chart.svg"
        subprocess.run(["npx", "-y", "ztd-charts-cli", "render", str(HERE / f"{name}.json"), "--out", str(target), "--theme", "light", "--locale", "ko", "--width", str(width)], check=True, capture_output=True)
        source = re.sub(r'<text [^>]*></text>', "", target.read_text())
        # 카드 바깥 여백을 잘라 같은 너비에서 글자를 키운다.
        w, h = map(int, re.match(r'<svg [^>]*?width="(\d+)" height="(\d+)"', source).groups())
        source = source.replace(f'width="{w}" height="{h}" viewBox="0 0 {w} {h}"', f'width="{w-40}" height="{h-40}" viewBox="20 20 {w-40} {h-40}"', 1)
        # ZTD 밝은 테마의 강조색을 브랜드 주황으로 바꾼다. 막대 위 숫자는 검정이라 대비가 유지된다.
        (OUT / f"{name}{suffix}.svg").write_text(source.replace("#0B8FD8", ACCENT).replace("#006DA8", ACCENT_TEXT).replace("#14171B", INK).replace("#5D6570", MUTED))


KINDS = [
    ("기획", "글을 쓰고 흐름을 정해요", ["기획 문서", "시나리오 개요", "씬 구성", "대본", "샷 설계"]),
    ("자료", "외형과 기준을 정해요", ["캐릭터 시트", "레퍼런스 이미지", "레퍼런스 영상"]),
    ("제작", "화면과 소리를 만들어요", ["키프레임", "AI 영상", "음향 큐", "타임라인"]),
    ("정리", "고르고 적어 둬요", ["테이크 스위치", "작업 메모"]),
]
K_TITLE, K_DESC = "노드 14종", "기획 5종, 자료 3종, 제작 4종, 정리 2종입니다."


def chip(x, y, label, size=15):
    w = sum(size if ord(c) > 127 else size * .6 for c in label) + 24
    return w, [box(x, y, w, 36), text(x + w / 2, y + 24, label, size, 600, INK, "middle")]


def kinds(width, narrow=False):
    b, y = [], 12
    for i, (name, note, items) in enumerate(KINDS):
        focal, left = name == "제작", 20 if narrow else 168
        rows, x, cy = [], left, y + (62 if narrow else 14)
        for item in items:
            w, parts = chip(x, cy, item)
            if x + w > width - 20:
                x, cy = left, cy + 44
                w, parts = chip(x, cy, item)
            rows += parts
            x += w + 8
        h = max(cy + 50 - y, 64)
        b.append(box(1, y, width - 2, h, TINT if focal else PAPER, ACCENT if focal else RULE))
        b += [text(20, y + 30, name, 18, 700, ACCENT_TEXT if focal else INK), text(20, y + 51, note, 13 if narrow else 12, 400, MUTED)] + rows
        y += h + 10
    return svg("node-kinds" + ("-narrow" if narrow else ""), width, y + 2, K_TITLE, K_DESC, b)


T_TITLE, T_DESC = "타임라인의 세 줄", "컷, 음향, 자막이 같은 시간을 나눠 씁니다. 디졸브를 넣으면 두 컷이 겹친 만큼 전체 길이가 줄어듭니다. 3초 컷 두 개에 0.5초 디졸브를 넣으면 5.5초입니다."


def timeline(width, narrow=False):
    left, span = (16, width - 32) if narrow else (96, width - 120)
    unit, b, gap = span / 5.5, [], 26 if narrow else 0
    X = lambda t: left + t * unit
    for k in range(6):
        b += [f'<path d="M{X(k)} 34V{330 if narrow else 250}" stroke="{RULE}" stroke-width="1"/>', text(X(k), 24, f"{k}초", 13, 400, MUTED, "middle" if k else "start")]
    y = 46
    def label(name):
        b.append(text(left, y + 16, name, 15, 700) if narrow else text(16, y + 30, name, 16, 700))
    label("컷"); y += gap
    b += [box(X(0), y, 3 * unit, 46), box(X(2.5), y, 3 * unit, 46), f'<rect x="{X(2.5)}" y="{y}" width="{.5 * unit}" height="46" fill="{TINT}" stroke="{ACCENT}" stroke-width="1.5"/>']
    b += [text(X(1.1), y + 29, "컷 1 · 3초", 15, 600, INK, "middle"), text(X(4.3), y + 29, "컷 2 · 3초", 15, 600, INK, "middle")]
    b.append(text(X(2.75), y + 66, "디졸브 0.5초", 13, 600, ACCENT_TEXT, "middle")); y += 82
    label("음향"); y += gap
    b += [box(X(.2), y, 2 * unit, 34), box(X(1.6), y + 40, 3.7 * unit, 34), text(X(1.2), y + 23, "대사", 14, 600, INK, "middle"), text(X(3.4), y + 63, "음악", 14, 600, INK, "middle")]; y += 88
    label("자막"); y += gap
    for a, w, word in ((.2, .7, "오늘이"), (.95, .9, "마지막"), (1.9, .9, "필름")):
        b += [box(X(a), y, w * unit, 34), text(X(a + w / 2), y + 23, word, 13, 600, INK, "middle")]
    y += 58
    b += [text(left, y + 8, "3초 + 3초 − 0.5초 = 5.5초", 16, 700, ACCENT_TEXT)]
    return svg("timeline-anatomy" + ("-narrow" if narrow else ""), width, y + 24, T_TITLE, T_DESC, b)


G_TITLE, G_DESC = "시트 분할에서 맞추는 값", "바깥 여백은 시트 가장자리와 칸 사이, 간격은 칸과 칸 사이입니다. 여백 네 곳과 가로·세로 간격을 맞추면 칸의 경계가 정해집니다."
G_NOTES = [("1", "바깥 여백", "위·아래·왼쪽·오른쪽을 따로"), ("2", "가로 간격", "왼쪽 칸과 오른쪽 칸 사이"), ("3", "세로 간격", "위 칸과 아래 칸 사이"), ("4", "개별 칸 경계", "한 칸만 따로 옮겨요")]


def sheet(width, narrow=False):
    ox, oy, size, pad, gx, gy = 12, 12, 296, 22, 14, 14
    c = (size - 2 * pad - 2 * gx) / 3
    b = [box(ox, oy, size, size, "#f3f4f5", INK)]
    for r in range(3):
        for k in range(3):
            x, y = ox + pad + k * (c + gx), oy + pad + r * (c + gy)
            focal = r == 2 and k == 2
            b.append(box(x, y, c, c, TINT if focal else PAPER, ACCENT if focal else RULE))
    def mark(x, y, n):
        b.extend([f'<circle cx="{x}" cy="{y}" r="12" fill="{INK}"/>', text(x, y + 5, n, 14, 700, PAPER, "middle")])
    mark(ox + pad / 2 + 1, oy + size / 2, "1"); mark(ox + pad + c + gx / 2, oy + pad + c / 2, "2"); mark(ox + pad + c * 1.5 + gx, oy + pad + c + gy / 2, "3"); mark(ox + size - pad - c / 2, oy + size - pad - c / 2, "4")
    lx, ly = (12, oy + size + 34) if narrow else (348, 48)
    for n, name, note in G_NOTES:
        mark(lx + 12, ly + 2, n)
        b += [text(lx + 36, ly + 3, name, 16, 700), text(lx + 36, ly + 25, note, 14, 400, MUTED)]
        ly += 66 if not narrow else 58
    return svg("sheet-grid" + ("-narrow" if narrow else ""), width, (ly - 20) if narrow else 320, G_TITLE, G_DESC, b)


write_diagram("omni-board", board_wide(), board_narrow())
write_diagram("dialogue-steps", steps_wide(), steps_narrow())
write_diagram("node-kinds", kinds(720), kinds(320, True))
write_diagram("timeline-anatomy", timeline(720), timeline(320, True))
write_diagram("sheet-grid", sheet(640), sheet(320, True))
for chart in ("paths-by-task", "voice-speed", "format-length", "node-budget", "director-presets"):
    write_chart(chart)
