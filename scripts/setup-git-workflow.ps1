[CmdletBinding()]
param(
    [switch]$DisableAutoPush
)

$ErrorActionPreference = 'Stop'

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw 'This script must run inside a Git repository.'
}

Set-Location $repoRoot

& git config --local core.hooksPath .githooks
& git config --local fetch.prune true
& git config --local pull.rebase true
& git config --local rebase.autoStash true
& git config --local push.default simple
& git config --local push.autoSetupRemote true

if ($DisableAutoPush) {
    & git config --local --bool sync.autoPush false
    Write-Host 'Git workflow installed. Automatic post-commit push is disabled.'
} else {
    & git config --local --bool sync.autoPush true
    Write-Host 'Git workflow installed. Automatic post-commit push is enabled for feature branches.'
}

Write-Host 'Protected branches: main/master. Use feature/*, fix/*, chore/*, or docs/* branches.'
Write-Host 'Recovery tags are created locally before every automatic push.'
