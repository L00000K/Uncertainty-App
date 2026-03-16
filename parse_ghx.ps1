$path = "C:\Users\USER\.gemini\antigravity\playground\uncertainty\Uncertainty - Statistics 250714 SZC Harwich (2).ghx"
$content = Get-Content $path -ReadCount 1000 -TotalCount 50000

$userText = Select-String -InputObject $content -Pattern '<item name="UserText"[^>]*>(.*?)</item>' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value }
$names = Select-String -InputObject $content -Pattern '<item name="Name"[^>]*>(.*?)</item>' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value }
$csharp = Select-String -InputObject $content -Pattern '<item name="Script"[^>]*>(.*?)</item>' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value }

Write-Host "--- Top 20 Names ---"
$names | Group-Object -NoElement | Sort-Object Count -Descending | Select-Object -First 20 | Format-Table -AutoSize

Write-Host "--- CSharp / Python Scripts ---"
$csharp | ForEach-Object {
    Write-Host $_
    Write-Host "---"
}

Write-Host "--- UserText (First 50) ---"
$userText | Select-Object -First 50 | ForEach-Object {
    Write-Host $_
}
