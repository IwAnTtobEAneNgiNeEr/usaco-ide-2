[CmdletBinding()]
param(
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

$token = if ($env:GH_TOKEN) { $env:GH_TOKEN } elseif ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { $null }
if (-not $token) {
    throw 'Set GH_TOKEN or GITHUB_TOKEN before applying GitHub branch protection. The token needs repository administration permission.'
}

$remote = (& git remote get-url origin).Trim()
if ($remote -notmatch 'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$') {
    throw "Could not derive a GitHub repository from origin: $remote"
}
$owner = $Matches[1]
$repo = $Matches[2]

$headers = @{
    Accept = 'application/vnd.github+json'
    Authorization = "Bearer $token"
    'X-GitHub-Api-Version' = '2022-11-28'
}

$body = @{
    required_status_checks = @{
        strict = $true
        contexts = @('ci-gate')
    }
    enforce_admins = $true
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $true
        required_approving_review_count = 1
        require_last_push_approval = $true
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_conversation_resolution = $true
} | ConvertTo-Json -Depth 10

$uri = "https://api.github.com/repos/$owner/$repo/branches/$Branch/protection"
Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
Write-Host "Branch protection applied to ${owner}/${repo}:$Branch"
