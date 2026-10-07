"""Run the explicit, paid image comparison with application secrets in memory."""

import os
import sys

from common import Infisical, ROOT, SecretError, application_environment


def main():
    environment = application_environment(Infisical().read())
    os.chdir(ROOT)
    command = ["node", "scripts/compare-image-models.mjs", *sys.argv[1:]]
    os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except SecretError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Could not run image comparison; credential details suppressed.", file=sys.stderr)
        sys.exit(1)
