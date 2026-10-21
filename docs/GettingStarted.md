# Getting started

Use the current README.md and operations/development.md. This is a local C++ IDE, not a hosted judge. Node 24 and GCC 16.2 are the verified local toolchain; legacy engines >=18 metadata is not a support guarantee. AI is optional and can remain unconfigured.

On a trusted clean setup, npm ci --prefix backend --ignore-scripts installs the locked backend dependencies; do not reinstall when working dependencies can be reused. node scripts/verify-repository.cjs provides static checks. Choose a new owned USACO_IDE_USER_DATA_DIR, keep HOST=127.0.0.1, and disable Companion when unused.

On the borrowed Windows machine use the existing MXC wrapper for server/compiler/tests. A temporary workspace alone is not containment. Never use global installations or a personal browser profile. Read SECURITY.md before running untrusted code or sending source to an AI provider.

The UI can edit source/tests and invoke Judge. Full AC applies only to a matching full judge fingerprint; changing relevant inputs makes it stale. Generated AI tests remain candidates until explicit review and are not judged automatically. See security/truth-core.md for evidence/history behavior.
