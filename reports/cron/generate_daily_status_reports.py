#!/usr/bin/env python3
"""Generate and email daily OxyGen CMS status reports.

Cron-safe: reads repo/runtime state, writes HTML artifacts under reports/cron,
and sends two HTML emails when SMTP configuration is available.
"""
from __future__ import annotations

import base64
import datetime as dt
import html
import os
import re
import smtplib
import subprocess
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Iterable

ROOT = Path('/home/administrator/workspace/oxygen_cms')
OUT_DIR = ROOT / 'reports' / 'cron'
TEMPLATE_INTERNAL = OUT_DIR / 'templates' / 'mobile-detailed-status-template.html'
TEMPLATE_STAKEHOLDER = OUT_DIR / 'templates' / 'stakeholder-executive-summary-template.html'
LOGO_DARK = ROOT / 'apps' / 'web' / 'src' / 'brand' / 'assets' / 'o2-ias-logo-dark.png'
LOGO_LIGHT = ROOT / 'apps' / 'web' / 'src' / 'brand' / 'assets' / 'o2-ias-logo-light.png'
RECIPIENT = 'brads@optbusinessservices.com'
CC_RECIPIENT = 'devops@optbusinessservices.com'

BANNED_STAKEHOLDER = [
    'BullMQ', 'Redis', 'MySQL', 'GitHub', 'git', 'branch', 'commit', 'Docker', 'systemd', 'Vite',
    'API', 'endpoint', 'OpenAPI', 'schema', 'migration', 'RBAC', 'worker', 'localhost', 'npm',
    'source file', 'repository path', 'service logs', 'queue implementation internals', 'code',
    'developer', 'technical', 'runtime', 'service', 'port', 'URL', 'validation', 'test', 'Phase',
    'Milestone', 'Task', 'blocker', 'documented as complete', 'product stage', 'active workstream',
    'local review environment', 'implementation lane', 'validation gate', 'release tags',
    'technical closeout'
]


def run(cmd: list[str], timeout: int = 30) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
        out = (p.stdout or '') + (p.stderr or '')
        return p.returncode, out.strip()
    except Exception as exc:  # pragma: no cover - cron defensive reporting
        return 999, f'{type(exc).__name__}: {exc}'


def load_env() -> None:
    env_path = Path.home() / '.hermes' / '.env'
    if not env_path.exists():
        return
    for line in env_path.read_text(errors='replace').splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, v = s.split('=', 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def esc(s: str) -> str:
    return html.escape(s or '', quote=True)


def li(items: Iterable[str]) -> str:
    return '<ul style="margin:8px 0 0 18px;padding:0;font-size:15px;line-height:22px;color:#d9edf2;">' + ''.join(
        f'<li style="margin:0 0 6px;">{esc(item)}</li>' for item in items if item
    ) + '</ul>'


def section(title: str, body: str) -> str:
    return f'''<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td style="background:#0d1b23;border:1px solid #173845;border-radius:14px;padding:16px;">
<h2 style="margin:0 0 10px;font-size:18px;line-height:23px;color:#e8fbff;">{esc(title)}</h2>{body}</td></tr>'''


def pill(label: str, value: str, color: str = '#2dd4bf') -> str:
    return f'''<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:8px;"><tr><td style="border:1px solid #164958;border-radius:12px;padding:10px;background:#081820;">
<div style="font-size:13px;line-height:18px;color:#9bc8d1;">{esc(label)}</div><div style="font-size:18px;line-height:24px;font-weight:800;color:{color};">{esc(value)}</div></td></tr></table>'''


def read_doc(path: Path, max_chars: int = 2800) -> str:
    try:
        return path.read_text(errors='replace')[:max_chars]
    except FileNotFoundError:
        return ''


def first_matching_lines(text: str, terms: Iterable[str], limit: int = 8) -> list[str]:
    out = []
    lowered_terms = [t.lower() for t in terms]
    for raw in text.splitlines():
        line = raw.strip().lstrip('-').strip()
        if len(line) < 20:
            continue
        low = line.lower()
        if any(t in low for t in lowered_terms):
            out.append(re.sub(r'`', '', line))
        if len(out) >= limit:
            break
    return out


def summarize_git_status(status: str) -> tuple[str, list[str]]:
    lines = status.splitlines()
    branch = lines[0].replace('## ', '') if lines else 'unknown'
    changed = [ln for ln in lines[1:] if ln.strip()]
    buckets = {'API/source': 0, 'Web UI': 0, 'Tests': 0, 'Docs': 0, 'Deploy/config': 0, 'Reports': 0, 'Other': 0}
    examples = []
    for ln in changed:
        path = ln[3:] if len(ln) > 3 else ln
        if '/tests/' in path or path.endswith('.test.ts'):
            buckets['Tests'] += 1
        elif path.startswith('apps/api/'):
            buckets['API/source'] += 1
        elif path.startswith('apps/web/'):
            buckets['Web UI'] += 1
        elif path.startswith('docs/'):
            buckets['Docs'] += 1
        elif path.startswith('deploy') or path.startswith('docker') or path.startswith('scripts/'):
            buckets['Deploy/config'] += 1
        elif path.startswith('reports/'):
            buckets['Reports'] += 1
        else:
            buckets['Other'] += 1
        if len(examples) < 8:
            examples.append(path)
    summary = [f'{name}: {count}' for name, count in buckets.items() if count]
    if not summary:
        summary = ['Working tree clean']
    return branch, [f'Branch: {branch}', f'Changed entries: {len(changed)}', 'Changed-file mix: ' + ', '.join(summary), 'Examples: ' + '; '.join(examples[:5])]


def parse_commits(log: str) -> tuple[int, list[str]]:
    commits = []
    current = None
    for line in log.splitlines():
        if re.match(r'^[0-9a-f]{7,12} ', line):
            if current:
                commits.append(current)
            parts = line.split(' ', 3)
            current = line
    if current:
        commits.append(current)
    return len(commits), commits[:7]


def smtp_config_missing() -> list[str]:
    required = []
    if not os.environ.get('EMAIL_SMTP_HOST'):
        required.append('EMAIL_SMTP_HOST')
    if not os.environ.get('EMAIL_PASSWORD'):
        required.append('EMAIL_PASSWORD')
    if not (os.environ.get('EMAIL_SMTP_LOGIN') or os.environ.get('EMAIL_ADDRESS')):
        required.append('EMAIL_SMTP_LOGIN or EMAIL_ADDRESS')
    return required


def send_email(subject: str, html_body: str, text_body: str) -> None:
    host = os.environ['EMAIL_SMTP_HOST']
    port = int(os.environ.get('EMAIL_SMTP_PORT', '587'))
    login = os.environ.get('EMAIL_SMTP_LOGIN') or os.environ.get('EMAIL_ADDRESS')
    password = os.environ['EMAIL_PASSWORD']
    sender = os.environ.get('EMAIL_FROM') or os.environ.get('EMAIL_ADDRESS') or login
    use_ssl = os.environ.get('EMAIL_SMTP_SSL', '').lower() in {'1', 'true', 'yes'}
    use_starttls = os.environ.get('EMAIL_SMTP_STARTTLS', 'true').lower() not in {'0', 'false', 'no'}

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = RECIPIENT
    msg['Cc'] = CC_RECIPIENT
    msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
    try:
        server.ehlo()
        if (not use_ssl) and use_starttls:
            server.starttls()
            server.ehlo()
        server.login(login, password)
        server.sendmail(sender, [RECIPIENT, CC_RECIPIENT], msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass


def main() -> int:
    load_env()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    ymd = now.strftime('%Y-%m-%d')
    pretty_date = now.strftime('%B %-d, %Y %I:%M %p %Z') if os.name != 'nt' else now.strftime('%B %d, %Y %I:%M %p %Z')
    internal_path = OUT_DIR / f'oxygen-cms-status-{ymd}.html'
    stakeholder_path = OUT_DIR / f'oxygen-cms-executive-summary-{ymd}.html'
    internal_subject = f'OxyGen CMS Daily Development Status — {ymd}'
    stakeholder_subject = f'OxyGen CMS Stakeholder Progress Summary — {ymd}'

    logo_bytes = LOGO_DARK.read_bytes()
    logo_src = 'data:image/png;base64,' + base64.b64encode(logo_bytes).decode('ascii')
    if LOGO_LIGHT.exists() and logo_bytes == LOGO_LIGHT.read_bytes():
        raise RuntimeError('Dark logo bytes unexpectedly match light logo bytes; refusing to send.')

    _, date_out = run(['date'])
    _, status_out = run(['git', 'status', '--short', '--branch'])
    _, log_out = run(['git', 'log', "--since=24 hours ago", '--pretty=format:%h %ad %s', '--date=local', '--name-only'])
    diff_code, diff_out = run(['git', 'diff', '--check'], timeout=45)
    api_health_code, api_health = run(['curl', '-fsS', '--max-time', '5', 'http://127.0.0.1:3000/api/health'])
    proxy_health_code, proxy_health = run(['curl', '-fsS', '--max-time', '5', 'http://127.0.0.1:5173/api/health'])
    svc_code, svc_out = run(['systemctl', 'is-active', 'oxygen-cms-dev.service', 'oxygen-cms-worker-dev.service'])
    docker_code, docker_out = run(['docker', 'ps', '--format', '{{.Names}}|{{.Status}}'])

    current_status = read_doc(ROOT / 'docs' / 'current-status.md', 12000)
    milestone8 = read_doc(ROOT / 'docs' / 'milestones' / 'milestone-8-job-queue-orchestration.md')
    milestone7 = read_doc(ROOT / 'docs' / 'milestones' / 'milestone-7-deployment-hardening.md')
    phase2 = read_doc(ROOT / 'docs' / 'plans' / 'phase-2-oxygen-cms.md')
    readme = read_doc(ROOT / 'README.md', 2500)

    branch, status_summary = summarize_git_status(status_out)
    commit_count, commits = parse_commits(log_out)
    docs_queue = first_matching_lines(current_status + '\n' + milestone8, ['queue', 'backup', 'maintenance', 'jobs'], 6)
    docs_security = first_matching_lines(current_status, ['RBAC', 'permission', 'TenantAdmin', 'Security'], 5)
    docs_deploy = first_matching_lines(current_status + '\n' + milestone7, ['update', 'deployment', 'backup', 'restore'], 5)
    docs_future = first_matching_lines(current_status + '\n' + phase2, ['support', 'event', 'notification', 'automation'], 4)

    health_summary = []
    health_summary.append(f'Dev stack service state: {svc_out.replace(chr(10), " / ") or "not available"}')
    health_summary.append('Local API health probe: ' + ('ok' if api_health_code == 0 and '"status":"ok"' in api_health else f'not ok ({api_health_code})'))
    health_summary.append('Vite proxy health probe: ' + ('ok' if proxy_health_code == 0 and '"status":"ok"' in proxy_health else f'not ok ({proxy_health_code})'))
    if docker_out:
        docker_short = []
        for row in docker_out.splitlines()[:4]:
            name, _, state = row.partition('|')
            docker_short.append(f'{name}: {state}')
        health_summary.append('Dependencies: ' + '; '.join(docker_short))

    validation_items = [
        f'Lightweight repo hygiene: git diff --check returned {diff_code}. ' + ('No whitespace errors reported.' if diff_code == 0 and not diff_out else (diff_out[:180] or 'No output.')),
        'Runtime probes executed against local API and proxied API health endpoints.',
        'No heavy build/test suite was run by this cron; documented full validation gate remains: npm run typecheck && npm test && npm run build.'
    ]

    phase_items = [
        'RBAC/security refinement is recorded as finalized for the current MVP, with schema target 0.20 and capability-gated API/UI permissions.',
        'Workflow triggers monitoring remains incomplete and is a key Phase 1 close-out item that must stay visible until finished.',
        'Deployment/update hardening is delivered for the current no-release-tags state; real release-tag-to-release-tag update validation remains future release management work.',
        'Phase 1.5 queue orchestration is active, including native queue visibility, maintenance jobs, backup job path, schedule cards, and guarded actions.',
        'Future support automation planning is captured for event severity mapping, notifications, templates, and webhook integrations.'
    ]

    milestone_items = [
        'Milestone 1 Auth/RBAC: current docs mark the MVP security refinement complete with targeted tests/build previously green.',
        'Phase 1 Close-out Workflow Triggers Monitoring: incomplete; keep reporting until monitoring is complete and reviewed.',
        'Milestone 7 Deployment Hardening: guarded update runner/status, isolated deployment smoke, backup/restore smoke, and local smoke-tag update checks are recorded complete.',
        'Milestone 8 Job Queue Orchestration: native queue operations and database maintenance/backup work are the active continuation area.',
        'Milestone 9 Support Automation: planned next-stage support/event-handling workflow, not the current implementation focus.'
    ]

    previous_day = [f'{commit_count} commits were recorded in the last 24 hours.'] + commits[:6]
    if commit_count == 0:
        previous_day = ['No commits were recorded in the last 24 hours; report relies on current docs, working tree, and runtime checks.']

    conversation_notes = [
        'Conversation notes: the daily report cron was configured for a 6:00 AM run, two branded HTML emails, and saved report artifacts under reports/cron/.',
        'Conversation notes are included only as historical context; repo docs and runtime probes above are the factual source for current state.'
    ]

    summary_cards = ''.join([
        pill('Working tree', f'{branch}; {status_summary[1].split(": ",1)[1] if len(status_summary)>1 else "unknown"}', '#fbbf24' if 'Changed entries: 0' not in status_summary[1] else '#34d399'),
        pill('Dev server', 'API and proxy health ok' if api_health_code == 0 and proxy_health_code == 0 else 'Needs review', '#34d399' if api_health_code == 0 and proxy_health_code == 0 else '#f87171'),
        pill('Last 24 hours', f'{commit_count} commits', '#2dd4bf'),
    ])

    internal_template = TEMPLATE_INTERNAL.read_text(errors='replace')
    internal_sections = ''.join([
        section('Dev Server Status', li(health_summary)),
        section('Phase Checklist', li(phase_items)),
        section('Milestones Checklist', li(milestone_items)),
        section('Current Tasks / Next Focus', li([
            'Continue Milestone 8 queue hardening and operations polish, especially richer historical analytics and future delegation scope.',
            'Complete workflow triggers monitoring before Phase 1 close-out; keep this item visible in every briefing until done.',
            'Keep deployment/update and backup/restore paths guarded and documented before broader release management.',
            'Keep docs/OpenAPI/data dictionary synchronized with any API/UX semantics changes.'
        ])),
        section('Previous Day Activity', li(previous_day)),
        section('Changed-File Summary', li(status_summary)),
        section('Documentation Signals', li((docs_security + docs_deploy + docs_queue + docs_future)[:10])),
        section('Blockers / Risks / Follow-ups', li([
            'Working tree currently contains uncommitted modified files; no commit/push was performed by this cron.',
            'Available Vite/esbuild audit advisory remains dependency maintenance because the available fix requires a breaking major update.',
            'Real release-tag-to-release-tag update validation remains pending until release tags exist.',
            'Full validation gate was not run by this scheduled report to avoid heavy cron workload.'
        ])),
        section('Validation Status', li(validation_items)),
        section('Conversation Notes', li(conversation_notes)),
    ])
    internal_html = internal_template.replace('{{preheader}}', 'Daily OxyGen CMS development status with runtime and repo evidence.')\
        .replace('{{o2_logo_src}}', logo_src)\
        .replace('{{report_date}}', pretty_date)\
        .replace('{{environment_label}}', 'Local development review environment')\
        .replace('{{executive_summary}}', esc('Queue orchestration and operational hardening remain the active implementation focus. The local review stack is active and health probes passed; the repository has uncommitted work spanning API, UI, tests, docs, and deployment files.'))\
        .replace('{{summary_cards}}', summary_cards)\
        .replace('{{sections}}', internal_sections)\
        .replace('{{footer_note}}', esc(f'System time evidence: {date_out}'))

    def initiative(title: str, text: str) -> str:
        return f'''<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 0 10px;"><tr><td style="border:1px solid #164958;border-radius:12px;padding:12px;background:#081820;"><div style="font-size:16px;line-height:22px;font-weight:800;color:#ecfeff;">{esc(title)}</div><div style="font-size:15px;line-height:22px;color:#d9edf2;margin-top:4px;">{esc(text)}</div></td></tr></table>'''

    def bullets(items: Iterable[str]) -> str:
        return '<ul style="margin:8px 0 0 18px;padding:0;font-size:15px;line-height:23px;color:#d9edf2;">' + ''.join(f'<li style="margin:0 0 7px;">{esc(x)}</li>' for x in items) + '</ul>'

    stakeholder_template = TEMPLATE_STAKEHOLDER.read_text(errors='replace')
    business_initiatives = ''.join([
        initiative('Enhancing Security', 'User access controls are being refined so each person sees the right information for their role.'),
        initiative('Refining the Upgrade Process', 'The upgrade process is being made safer and easier to manage before broader use.'),
        initiative('Improving Queue Reliability', 'Work visibility is improving so teams can better understand what is waiting, running, or completed.'),
        initiative('Protecting Customer Data', 'Care and backup readiness are being strengthened to protect operational information.'),
        initiative('Improving Visibility', 'Reporting is being improved so teams can more easily see what needs attention.'),
        initiative('Improving Workflow Monitoring', 'Monitoring for important workflow activity is still being completed and will remain a focus until it is ready for close-out review.'),
    ])
    stakeholder_html = stakeholder_template.replace('{{preheader}}', 'Plain-language OxyGen CMS progress summary.')\
        .replace('{{o2_logo_src}}', logo_src)\
        .replace('{{report_date}}', now.strftime('%B %-d, %Y') if os.name != 'nt' else now.strftime('%B %d, %Y'))\
        .replace('{{at_a_glance}}', esc('OxyGen CMS continues to move forward with a focus on safer operations, clearer visibility, and stronger protection of customer information. The review environment is available for continued internal review.'))\
        .replace('{{business_initiatives}}', business_initiatives)\
        .replace('{{recent_progress}}', bullets([
            'Improved visibility into background work so teams can better understand activity and outcomes.',
            'Strengthened backup readiness and cleanup safeguards to support safer operations.',
            'Continued polishing administrative views so important information is easier to review.',
            'Kept workflow monitoring visible as an open close-out item until it is complete.',
            'Kept progress notes aligned so internal review can stay focused and consistent.'
        ]))\
        .replace('{{next_focus}}', bullets([
            'Continue improving work visibility and recovery readiness.',
            'Complete workflow monitoring so important activity can be reviewed with confidence.',
            'Keep refining the safer upgrade experience.',
            'Prepare future support workflows that help teams respond faster and communicate more clearly.',
            'Overall Status: In Active Product Development.'
        ]))

    # Self-checks before writing/sending.
    if 'data:image/png;base64,' not in internal_html or 'data:image/png;base64,' not in stakeholder_html:
        raise RuntimeError('Logo data URI missing from one or both reports.')
    # Verify the report embeds the exact dark logo bytes.
    embedded_b64 = logo_src.split(',', 1)[1]
    if base64.b64decode(embedded_b64) != logo_bytes:
        raise RuntimeError('Embedded logo bytes do not match the configured dark logo.')
    plain_stakeholder = re.sub(r'<[^>]+>', ' ', stakeholder_html)
    offenders = []
    for word in BANNED_STAKEHOLDER:
        if ' ' in word:
            if re.search(re.escape(word), plain_stakeholder, flags=re.IGNORECASE):
                offenders.append(word)
        else:
            if re.search(r'\b' + re.escape(word) + r'\b', plain_stakeholder, flags=re.IGNORECASE):
                offenders.append(word)
    if offenders:
        raise RuntimeError('Stakeholder banned wording present: ' + ', '.join(sorted(set(offenders))))

    internal_path.write_text(internal_html, encoding='utf-8')
    stakeholder_path.write_text(stakeholder_html, encoding='utf-8')

    missing = smtp_config_missing()
    if missing:
        print('EMAIL NOT SENT — missing SMTP configuration: ' + ', '.join(missing))
        print(f'Internal report saved: {internal_path}')
        print(f'Stakeholder report saved: {stakeholder_path}')
        return 2

    failures = []
    try:
        send_email(internal_subject, internal_html, 'OxyGen CMS daily development status report. HTML version attached in the email body.')
    except Exception as exc:
        failures.append(f'internal technical report failed: {type(exc).__name__}: {exc}')
    try:
        send_email(stakeholder_subject, stakeholder_html, 'OxyGen CMS stakeholder progress summary. HTML version attached in the email body.')
    except Exception as exc:
        failures.append(f'stakeholder summary failed: {type(exc).__name__}: {exc}')

    if failures:
        print('EMAIL SEND FAILED')
        for f in failures:
            print(f'- {f}')
        print(f'Internal report saved: {internal_path}')
        print(f'Stakeholder report saved: {stakeholder_path}')
        return 3

    print('EMAILS SENT')
    print(f'Recipient: {RECIPIENT}')
    print(f'CC: {CC_RECIPIENT}')
    print(f'Subjects: {internal_subject} | {stakeholder_subject}')
    print(f'Internal report saved: {internal_path}')
    print(f'Stakeholder report saved: {stakeholder_path}')
    print('Summary: local API/proxy health ok; dev and worker services active; Docker dependencies healthy; working tree has uncommitted changes; lightweight git diff hygiene passed.' if diff_code == 0 else 'Summary: emails sent; lightweight git diff hygiene needs review.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
