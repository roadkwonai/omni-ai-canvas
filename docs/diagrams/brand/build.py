"""Omni AI Canvas 인포그래픽과 도표를 다시 만든다.

python3 docs/diagrams/brand/build.py  (ZTD Charts 렌더에는 npx가 필요하다)
Diagram Design: omni-board(dp-integration), dialogue-steps(steps). ZTD Charts: bar 두 개.
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


write_diagram("omni-board", board_wide(), board_narrow())
write_diagram("dialogue-steps", steps_wide(), steps_narrow())
for chart in ("paths-by-task", "voice-speed"):
    write_chart(chart)
