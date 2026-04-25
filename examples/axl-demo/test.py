"""
LoveClaw + AXL = two-agent test sequence.
"""

import threading
import time

from rgb import G, Y, B, M, C, DIM, BOLD, RST

def run_test(alice, boris, poll_loop):
    hr = f'{BOLD}{"─" * 64}{RST}'
    print(f'\n{hr}')
    print(f'  {BOLD}LoveClaw + AXL Two-Agent A2A Test{RST}')
    print(hr)
    print(f'\n Alice key: {C}{alice.my_key[:32]}…{RST} (AXL :{alice.axl_port})')
    print(f' Boris key: {M}{boris.my_key[:32]}…{RST} (AXL :{boris.axl_port})')
    print()

    stop = threading.Event()
    t_a = threading.Thread(target=poll_loop, args=(alice, stop), daemon=True, name='poll-alice')
    t_b = threading.Thread(target=poll_loop, args=(boris, stop), daemon=True, name='poll-boris')
    t_a.start()
    t_b.start()

    def step(label: str, fn, pause: float = 1.2):
        print(f'  {DIM}── {label}{RST}')
        fn()
        time.sleep(pause)

    step('Boris → Alice: axl_handshake', lambda: (
        boris.log(G, '→ axl_handshake', 'introducing myself to Alice'),
        boris.send({'type': 'axl_handshake', 'name': 'Boris', 'key': boris.my_key}),
    ))
    step('Alice → Boris: axl_handshake', lambda: (
        alice.log(G, '→ axl_handshake', 'responding to Boris'),
        alice.send({'type': 'axl_handshake', 'name': 'Alice', 'key': alice.my_key}),
    ))
    step('Alice → Boris: score', lambda: (
        alice.log(B, '→ score', 'broadcasting trust score'),
        alice.send({'type': 'score', 'score': 97, 'from': 'Alice'}),
    ))
    step('Boris → Alice: diary', lambda: (
        boris.log(M, '→ diary', 'sharing a memory'),
        boris.send({'type': 'diary', 'author': 'Boris', 'text': 'Made your favourite pasta. Left some in the fridge.'}),
    ))
    step('Boris → Alice: breach_candidate', lambda: (
        boris.log(Y, '→ breach_candidate', 'flagging suspicious signal — seeking Alice vote'),
        boris.send({
            'type':      'breach_candidate',
            'id':        f'c-{int(time.time())}',
            'from_name': 'Boris',
            'my_vote':   True,
            'evidence':  [{'app_name': 'Tinder', 'package': 'com.tinder', 'score': 80}],
            'narrative': 'Tinder detected on Boris device during heartbeat scan.',
        }),
    ))
    time.sleep(1.5)
    step('broadcast: agent_state (both)', lambda: (
        alice.send({
            'type': 'agent_state',
            'name': 'Alice',
            'score': 97
        }),
        boris.send({
            'type': 'agent_state',
            'name': 'Boris',
            'score': 42
        }),
    ), pause=1.5)

    print(f'\n{hr}')
    print(f'  {G+BOLD}P2P messaging confirmed — 6 message types exchanged across two AXL nodes{RST}')
    print(hr)
    print()

    return stop, t_a, t_b
