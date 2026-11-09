"""Opt-in Agent Vault app launcher; never retrieves application secrets."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REPO = 'reshoot'
PROJECT = 'cdb4be1b-c53c-4b18-87eb-6f90aae2b661'
ADAPTER = 'lib/generation/agentbridge.ts'
DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017'
PROFILE = Path.home() / '.config/infisical/agentbridge-clients' / (REPO + '-tools.json')
MARKER = 'agentbridge_public_placeholder'
NODE_RELATIVE = '.config/infisical/runtimes/node-v24.22.1-darwin-arm64/bin/node'


def load_profile(mode='check'):
    profile = PROFILE
    if profile.is_symlink():
        raise ValueError('The AgentBridge profile must be a regular file.')
    info = profile.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('The AgentBridge profile must be owner-only.')
    p = json.loads(profile.read_text())
    fields = {'version', 'repository', 'repo_path', 'project_id', 'source_environment',
              'source_path', 'bundle', 'base_url', 'proxy', 'ca_file', 'ca_fingerprint',
              'infisical', 'node', 'adapter', 'adapter_sha256', 'default_model', 'code_sha256'}
    if set(p) != fields or type(p['version']) is not int or p['version'] != 1:
        raise ValueError('Unsupported AgentBridge profile.')
    native = json.loads((ROOT / '.infisical.json').read_text())
    if native != {'workspaceId': PROJECT, 'defaultEnvironment': 'dev',
                  'gitBranchToEnvironmentMapping': None, 'domain': 'https://app.infisical.com'}:
        raise ValueError('The native source identity differs from the reviewed binding.')
    expected = {'repository': REPO, 'repo_path': str(ROOT), 'project_id': PROJECT,
        'source_environment': 'dev', 'source_path': '/agents/agentbridge',
        'bundle': 'local-' + REPO + '-agentbridge-tools',
        'base_url': 'http://127.0.0.1:8082/api/v1', 'proxy': '127.0.0.1:8283',
        'adapter': ADAPTER, 'default_model': DEFAULT_MODEL}
    if any(p[key] != value for key, value in expected.items()):
        raise ValueError('The service mapping differs from the reviewed binding.')
    adapter = ROOT / ADAPTER
    if adapter.is_symlink() or hashlib.sha256(adapter.read_bytes()).hexdigest() != p['adapter_sha256']:
        raise ValueError('The application routing helper changed; review the profile again.')
    files = {'scripts/infisical/' + name for name in (
        'agentbridge_tools_vault.py', 'agentbridge_tools_client.mjs', 'agentbridge_transport.mjs',
        'agentbridge_preload.mjs', 'agentbridge_compare.mjs', 'agentbridge_tools.sb')}
    files.update({'scripts/compare-image-models.mjs', 'lib/generation/request.ts',
        'package.json', 'pnpm-lock.yaml'})
    if set(p['code_sha256']) != files:
        raise ValueError('Incomplete reviewed launcher pins.')
    for name, digest in p['code_sha256'].items():
        target = ROOT / name
        if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('The launcher changed; trusted review is required.')
    if not re.fullmatch(r'SHA256:(?:[0-9A-F]{2}:){31}[0-9A-F]{2}', p['ca_fingerprint']):
        raise ValueError('Invalid proxy CA fingerprint.')
    if p['node'] != str(Path.home() / NODE_RELATIVE):
        raise ValueError('Use the reviewed side-by-side Node 24 runtime.')
    if not all(Path(p[key]).is_absolute() and Path(p[key]).is_file() for key in ('node', 'infisical', 'ca_file')):
        raise ValueError('A reviewed runtime, CLI or CA is missing.')
    return p


def sandbox_prefix(p, output):
    return ['/usr/bin/sandbox-exec', '-D', 'USER_HOME=' + str(Path.home()),
        '-D', 'REPO_ROOT=' + str(ROOT), '-D', 'CA_FILE=' + p['ca_file'],
        '-D', 'NODE_ROOT=' + str(Path(p['node']).parent.parent),
        '-D', 'NODE_BIN=' + p['node'], '-D', 'OUTPUT_DIR=' + str(output),
        '-f', str(ROOT / 'scripts/infisical/agentbridge_tools.sb')]


def session_command(p, mode='check', arguments=(), output=None):
    script = 'agentbridge_tools_client.mjs' if mode == 'check' else 'agentbridge_compare.mjs'
    output = output or ROOT / '.internal/agent-vault/comparisons'
    return [p['infisical'], 'agent-vault', 'run', '--domain=https://app.infisical.com',
        '--access-bundle=' + p['bundle'], '--proxy=' + p['proxy'],
        '--ca-fingerprint=' + p['ca_fingerprint'], '--ttl=20m', '--no-ca-trust',
        '--silent', '--telemetry=false', '--no-skills', '--', '/usr/bin/env',
        'AGENTBRIDGE_API_KEY=' + MARKER, 'AGENTBRIDGE_BASE_URL=' + p['base_url'],
        'AGENTBRIDGE_APP_CONFIG=' + str(ROOT / ADAPTER),
        'AGENTBRIDGE_DEFAULT_MODEL=' + DEFAULT_MODEL, 'NODE_ENV=development',
        'NODE_USE_ENV_PROXY=1', 'NO_PROXY=', 'no_proxy=',
        'NODE_EXTRA_CA_CERTS=' + p['ca_file'], *sandbox_prefix(p, output), p['node'],
        '--use-env-proxy', '--experimental-transform-types', '--disable-warning=ExperimentalWarning',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        '--import=' + (ROOT / 'scripts/infisical/agentbridge_preload.mjs').as_uri(),
        str(ROOT / 'scripts/infisical' / script), *arguments]


def comparison_arguments(arguments):
    import argparse
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--phase', choices=('baseline', 'candidate'), required=True)
    parser.add_argument('--model', choices=('openai/gpt-image-2.6-sunburst',))
    parser.add_argument('--output-dir', type=Path, required=True)
    opts = parser.parse_args(arguments)
    output = opts.output_dir.absolute()
    parent = ROOT / '.internal/agent-vault/comparisons'
    if output == parent or not output.is_relative_to(parent) or output.resolve() != output or not output.is_dir():
        raise ValueError('Use an existing canonical run directory under .internal/agent-vault/comparisons.')
    return output


def main(arguments):
    if not arguments or arguments[0] not in ('check', 'compare'):
        raise ValueError('Use check or compare with explicit phase and output directory.')
    mode = arguments[0]
    rest = arguments[1:]
    if mode == 'check' and rest:
        raise ValueError('The read-only check accepts no overrides.')
    output = comparison_arguments(rest) if mode == 'compare' else ROOT / '.internal/agent-vault/comparisons'
    p = load_profile(mode)
    env = {'HOME': str(Path.home()), 'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'}
    process = subprocess.Popen(session_command(p, mode, rest, output), cwd=ROOT, env=env,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True)
    try:
        stdout, _stderr = process.communicate(timeout=900 if mode == 'compare' else 75)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate(timeout=5)
        raise ValueError('Agent Vault operation interrupted or timed out; its owned processes were stopped.') from None
    if mode == 'compare':
        print(stdout.decode(), end='')
        return process.returncode
    records = [json.loads(line) for line in stdout.decode().splitlines() if line.startswith('{"ok":')]
    if len(records) != 1:
        raise ValueError('Agent Vault operation failed; verify the profile, gateway and Infisical login.')
    print(json.dumps(records[0]))
    return 0 if process.returncode == 0 and records[0].get('ok') is True else 1


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except ValueError as error:
        print(json.dumps({'ok': False, 'reason': str(error)}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'ok': False, 'reason': 'Agent Vault check failed; diagnostic details withheld.'}))
        sys.exit(1)
