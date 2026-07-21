from pathlib import Path

path = Path('docs/architecture/expedition-invitation-transactions.md')
text = path.read_text(encoding='utf-8')
text = text.replace(
    'verified normalized Auth email\npending invitation by UUID + Expedition + SHA-256 hash',
    'verified normalized Auth email (`email_verified = true`)\npending invitation by UUID + Expedition + SHA-256 hash',
)
needle = '''Only after accepted persistence does the wrapper create the Participant. If Participant insertion or invitation transition fails, the membership, receipt, events and projection roll back with it.
'''
addition = needle + '''
The enforced structural order is `membership → process_command → Participant → invitation accepted`.
'''
if 'membership → process_command → Participant' not in text:
    if needle not in text:
        raise SystemExit('architecture insertion point missing')
    text = text.replace(needle, addition)
path.write_text(text, encoding='utf-8')
