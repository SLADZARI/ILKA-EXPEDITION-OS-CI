from pathlib import Path

architecture = Path('docs/architecture/expedition-invitation-transactions.md')
text = architecture.read_text(encoding='utf-8')
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
architecture.write_text(text, encoding='utf-8')

test = Path('supabase/tests/invitation_transactions.test.sql')
text = test.read_text(encoding='utf-8')
text = text.replace(
    "select actor_id from ilka.event_log where command_id = 'cmd_gate9b2b_accept_a'",
    "select event_json ->> 'actor_id' from ilka.event_log where command_id = 'cmd_gate9b2b_accept_a'",
)
text = text.replace(
    "api.get_expedition_setup_view('missing_gate9b2b')::text,\n  null,",
    "api.get_expedition_setup_view('missing_gate9b2b')::text,\n  null::text,",
)
test.write_text(text, encoding='utf-8')
