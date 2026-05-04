"""Seed the focus-os store with the BUAD 6621 syllabus data.

This is a one-time hydration that creates:
- A course (BUAD 6621: Project Management)
- A syllabus note containing the full extracted text
- Academic deadlines for every dated item in the schedule
- Assignments for SIM1, SIM2, ProjCharter, PMP, Team Eval
- Study items (flashcards) for each book chapter

Run once before launching the app. The next launch will see all this
data and surface it across Dashboard / Quiz / Cards / Parser / Syllabus
tabs and the notch attention queue.
"""
import json, uuid, time, os
from datetime import datetime, timezone

STORE = "/Users/e/Library/Application Support/focus-os/focus-os-store.json"
SYLLABUS_TXT = open("/tmp/buad6621.txt").read()

def now_ms(): return int(time.time() * 1000)
def uid(): return str(uuid.uuid4())

# Convert "M/D" in 2026 to epoch ms at given time-of-day (default 23:59).
def at(month, day, hour=23, minute=59):
    dt = datetime(2026, month, day, hour, minute, 0)
    return int(dt.timestamp() * 1000)

with open(STORE) as f:
    store = json.load(f)

# ── Remove any prior BUAD 6621 seed so this is idempotent ──────────────
def is_buad(item):
    txt = (item.get('title','') or item.get('name','') or '').upper()
    return 'BUAD 6621' in txt or item.get('courseCode') == 'BUAD 6621'

def has_buad_course_id(item, buad_id):
    return item.get('courseId') == buad_id

# Find existing BUAD 6621 course id (if any) to clean up children
existing = next((c for c in store.get('courses', []) if 'BUAD 6621' in (c.get('name','')+ ' ' + c.get('code',''))), None)
if existing:
    bid = existing['id']
    store['courses'] = [c for c in store['courses'] if c['id'] != bid]
    store['assignments'] = [a for a in store.get('assignments', []) if a.get('courseId') != bid]
    store['academicDeadlines'] = [d for d in store.get('academicDeadlines', []) if d.get('courseId') != bid]
    store['studyItems'] = [s for s in store.get('studyItems', []) if s.get('courseId') != bid]
    store['notes'] = [n for n in store.get('notes', []) if n.get('courseId') != bid]
    print(f"Cleaned previous BUAD 6621 entries (course={bid})")

# ── 1. Course ──────────────────────────────────────────────────────────
course_id = uid()
course = {
    "id": course_id,
    "code": "BUAD 6621",
    "name": "Project Management",
    "term": "Spring 2026",
    "instructor": "Dr. Eleanor Loiacono",
    "instructorEmail": "eloiacono@wm.edu",
    "location": "Miller Hall 1019",
    "meetingDays": ["Mon", "Wed"],
    "meetingTime": "11:00 AM – 12:20 PM",
    "color": "#5fa1ff",
    "createdAt": now_ms(),
    "updatedAt": now_ms(),
    "archived": False,
}
store.setdefault('courses', []).append(course)

# ── 2. Syllabus note (TipTap doc with full text) ───────────────────────
syllabus_note_id = uid()
# Build minimal TipTap doc
def tip_paragraph(text):
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]} if text else {"type": "paragraph"}
content_doc = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "BUAD 6621: Project Management"}]},
        tip_paragraph("Spring 2026 — Dr. Eleanor Loiacono"),
        tip_paragraph("Miller Hall 1019 · MW 11:00 AM – 12:20 PM"),
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Syllabus"}]},
    ] + [tip_paragraph(line) for line in SYLLABUS_TXT.split('\n') if line.strip()][:200],
}
syllabus_note = {
    "id": syllabus_note_id,
    "title": "BUAD 6621 Syllabus",
    "content": json.dumps(content_doc),
    "documentType": "syllabus",
    "tags": ["syllabus"],
    "capturedFromIds": [],
    "courseId": course_id,
    "createdAt": now_ms(),
    "updatedAt": now_ms(),
}
store.setdefault('notes', []).append(syllabus_note)

# ── 3. Deadlines (six quizzes + journal/SIM/Charter/PMP) ───────────────
deadlines = []
def deadline(title, ts, type_, **extra):
    deadlines.append({
        "id": uid(),
        "title": title,
        "deadlineAt": ts,
        "type": type_,
        "courseId": course_id,
        "sourceType": "syllabus",
        "sourceId": syllabus_note_id,
        "confirmed": True,
        "completed": False,
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        **extra,
    })

deadline("Pre-Assessment Survey & Team Formation Form", at(1, 23), "other")
deadline("Quiz 1 — Chapters 1 & 2 + Weekly Journal",   at(1, 30), "quiz")
deadline("Purchase Simulation Packet",                  at(2,  2), "other")
deadline("Monthly Journal Synthesis Reflection",        at(2,  6), "other")
deadline("Quiz 2 — Chapters 3 & 4 + Weekly Journal",   at(2, 13), "quiz")
deadline("Project Charter (ProjCharter) + Journal",     at(2, 20), "project")
deadline("Quiz 3 — Chapters 5 & 6 + Weekly Journal",   at(2, 27), "quiz")
deadline("SIM1 (group)",                                at(3,  1), "project")
deadline("Weekly Journal Entry",                        at(3,  5), "other")
deadline("SIM2 (individual)",                           at(3, 27), "project")
deadline("Quiz 4 — Chapters 7 & 8 + Optional Journal", at(4,  3), "quiz")
deadline("Monthly Journal Synthesis Reflection",        at(4, 10), "other")
deadline("Quiz 5 — Chapters 9 & 10 + Optional Journal",at(4, 17), "quiz")
deadline("Optional Weekly Journal Entry",               at(4, 24), "other")
deadline("Post-Assessment Survey",                      at(4, 27), "other")
deadline("Quiz 6 — Chapters 11 & 12 + Optional Journal", at(5,  1), "quiz")
deadline("PMP Presentation & Slides",                   at(5,  4, 8, 0), "presentation")
deadline("Team Evaluation & Final Journal Synthesis",   at(5,  6), "other")

store.setdefault('academicDeadlines', []).extend(deadlines)

# ── 4. Assignments (the bigger graded artifacts) ────────────────────────
def assignment(title, due_ms, points, category, level, **extra):
    return {
        "id": uid(),
        "courseId": course_id,
        "title": title,
        "dueDate": due_ms,
        "sourceType": "syllabus",
        "sourceId": syllabus_note_id,
        "deliverables": [],
        "formatRequirements": [],
        "rubricItems": [],
        "submissionChecklist": [],
        "category": category,
        "level": level,
        "points": points,
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        **extra,
    }

assignments = [
    assignment("Project Charter (ProjCharter)", at(2, 20), 50,  "B", 4),
    assignment("SIM1 — Scenario A (group)",      at(3,  1), 100, "B", 3),
    assignment("SIM2 — Scenario B (individual)", at(3, 27), 100, "A", 2),
    assignment("PMP Final Plan + Presentation",  at(5,  4, 8, 0), 200, "B", 4),
    assignment("Team Evaluation",                 at(5,  6), 50,  "A", 1),
]
store.setdefault('assignments', []).extend(assignments)

# ── 5. Study items (one flashcard per chapter) ──────────────────────────
chapters = [
    (1, "Introduction to Project Management"),
    (2, "The Project Life Cycle"),
    (3, "Managing Project Teams"),
    (4, "Managing Project Stakeholders & Communication"),
    (5, "Managing Project Scope"),
    (6, "Managing Project Scheduling"),
    (7, "Managing Project Resources"),
    (8, "Managing Project Risk"),
    (9, "Managing Project Procurement"),
    (10, "Managing Project Quality"),
    (11, "Project Closure"),
    (12, "Agile and Adaptive Project Management"),
]
study_items = []
for n, topic in chapters:
    study_items.append({
        "id": uid(),
        "courseId": course_id,
        "type": "concept",
        "front": f"Chapter {n}: {topic}",
        "back": f"Read Schneider et al. ch. {n}. Be ready for the weekly quiz.",
        "nextReviewAt": now_ms(),
        "reviewCount": 0,
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
    })
store.setdefault('studyItems', []).extend(study_items)

# ── 6. Attention alerts for the next 3 imminent deadlines (notch feed) ──
upcoming = sorted([d for d in deadlines if d['deadlineAt'] >= now_ms()], key=lambda d: d['deadlineAt'])[:3]
alerts = store.setdefault('attentionAlerts', [])
# Clean prior BUAD seeded alerts
alerts[:] = [a for a in alerts if 'BUAD 6621' not in (a.get('title','') + ' ' + a.get('reason',''))]
for d in upcoming:
    days_until = max(0, int((d['deadlineAt'] - now_ms()) / 86_400_000))
    alerts.append({
        "id": uid(),
        "title": f"BUAD 6621: {d['title']}",
        "reason": f"Due in {days_until} day(s)",
        "priority": "high" if days_until <= 2 else "normal",
        "createdAt": now_ms(),
        "resolved": False,
    })

# ── Write back ──────────────────────────────────────────────────────────
with open(STORE, 'w') as f:
    json.dump(store, f, indent=2, ensure_ascii=False)

print(f"Seeded BUAD 6621 ({course_id}):")
print(f"  - 1 syllabus note")
print(f"  - {len(deadlines)} deadlines")
print(f"  - {len(assignments)} assignments")
print(f"  - {len(study_items)} study items (one per chapter)")
print(f"  - {len(upcoming)} attention alerts (most imminent)")
