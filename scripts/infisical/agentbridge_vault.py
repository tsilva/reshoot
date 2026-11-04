"""Opt-in Agent Vault model-catalog check; never retrieves application secrets."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REPO = 'reshoot'
PROJECT = 'cdb4be1b-c53c-4b18-87eb-6f90aae2b661'
ADAPTER = 'lib/generation/agentbridge.ts'
DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017'
PROFILE = Path.home() / '.config/infisical/agentbridge-clients' / (REPO + '-read.json')
MARKER = 'agentbridge_public_placeholder'
NODE_RELATIVE = '.config/infisical/runtimes/node-v24.22.1-darwin-arm64/bin/node'


def load_profile():
    if PROFILE.is_symlink():
        raise ValueError('The AgentBridge profile must be a regular file.')
    info = PROFILE.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('The AgentBridge profile must be owner-only.')
    p = json.loads(PROFILE.read_text())
    fields = {'version', 'repository', 'repo_path', 'project_id', 'source_environment',
              'source_path', 'bundle', 'base_url', 'proxy', 'ca_file', 'ca_fingerprint',
              'infisical', 'node', 'adapter', 'adapter_sha256', 'default_model'}
    if set(p) != fields or type(p['version']) is not int or p['version'] != 1:
        raise ValueError('Unsupported AgentBridge profile.')
    native = json.loads((ROOT / '.infisical.json').read_text())
    if native != {'workspaceId': PROJECT, 'defaultEnvironment': 'dev',
                  'gitBranchToEnvironmentMapping': None, 'domain': 'https://app.infisical.com'}:
        raise ValueError('The native source identity differs from the reviewed binding.')
    expected = {'repository': REPO, 'repo_path': str(ROOT), 'project_id': PROJECT,
        'source_environment': 'dev', 'source_path': '/', 'bundle': 'local-' + REPO + '-agentbridge-read',
        'base_url': 'http://127.0.0.1:8082/api/v1', 'proxy': '127.0.0.1:8283',
        'adapter': ADAPTER, 'default_model': DEFAULT_MODEL}
    if any(p[key] != value for key, value in expected.items()):
        raise ValueError('The service mapping differs from the reviewed binding.')
    adapter = ROOT / ADAPTER
    if adapter.is_symlink() or hashlib.sha256(adapter.read_bytes()).hexdigest() != p['adapter_sha256']:
        raise ValueError('The application routing helper changed; review the profile again.')
    if not re.fullmatch(r'SHA256:(?:[0-9A-F]{2}:){31}[0-9A-F]{2}', p['ca_fingerprint']):
        raise ValueError('Invalid proxy CA fingerprint.')
    if p['node'] != str(Path.home() / NODE_RELATIVE):
        raise ValueError('Use the reviewed side-by-side Node 24 runtime.')
    if not all(Path(p[key]).is_absolute() and Path(p[key]).is_file() for key in ('node', 'infisical', 'ca_file')):
        raise ValueError('A reviewed runtime, CLI or CA is missing.')
    return p


def sandbox_prefix(p):
    return ['/usr/bin/sandbox-exec', '-D', 'USER_HOME=' + str(Path.home()),
        '-D', 'REPO_ROOT=' + str(ROOT), '-D', 'CA_FILE=' + p['ca_file'],
        '-D', 'NODE_ROOT=' + str(Path(p['node']).parent.parent),
        '-D', 'APP_CONFIG=' + str(ROOT / ADAPTER),
        '-f', str(ROOT / 'scripts/infisical/agentbridge.sb')]


def client_command(p):
    return sandbox_prefix(p) + [p['node'], '--use-env-proxy',
        str(ROOT / 'scripts/infisical/agentbridge_client.mjs')]


def session_command(p):
    return [p['infisical'], 'agent-vault', 'run', '--domain=https://app.infisical.com',
        '--access-bundle=' + p['bundle'], '--proxy=' + p['proxy'],
        '--ca-fingerprint=' + p['ca_fingerprint'], '--ttl=10m', '--no-ca-trust',
        '--silent', '--telemetry=false', '--', '/usr/bin/env',
        'AGENTBRIDGE_API_KEY=' + MARKER, 'AGENTBRIDGE_BASE_URL=' + p['base_url'],
        'AGENTBRIDGE_APP_CONFIG=' + str(ROOT / ADAPTER),
        'AGENTBRIDGE_DEFAULT_MODEL=' + DEFAULT_MODEL, 'NODE_ENV=development',
        'NODE_USE_ENV_PROXY=1', 'NO_PROXY=', 'no_proxy=',
        'NODE_EXTRA_CA_CERTS=' + p['ca_file'], *client_command(p)]


def main(arguments):
    if arguments != ['check']:
        raise ValueError('Use check; source, scope and command overrides are rejected.')
    p = load_profile()
    env = {'HOME': str(Path.home()), 'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'}
    result = subprocess.run(session_command(p), cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)
    records = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{"ok":')]
    if not records:
        raise ValueError('Agent Vault check failed; verify the profile, gateway and Infisical login.')
    print(json.dumps(records[-1]))
    return 0 if result.returncode == 0 and records[-1].get('ok') is True else 1


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except ValueError as error:
        print(json.dumps({'ok': False, 'reason': str(error)}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'ok': False, 'reason': 'Agent Vault check failed; diagnostic details withheld.'}))
        sys.exit(1)
