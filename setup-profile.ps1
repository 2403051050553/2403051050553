# Jatin Tehalram Ahuja — GitHub profile setup
# Run from this repository after creating the public repo:
# https://github.com/2403051050553/2403051050553

$ErrorActionPreference = "Stop"

git remote set-url origin "https://github.com/2403051050553/2403051050553.git"
git branch -M main
git add .
git commit -m "feat: upgrade Jatin GitHub profile"
git push -u origin main

Write-Host "Profile pushed: https://github.com/2403051050553"
Write-Host "Then open Actions -> Update profile art -> Run workflow once."
