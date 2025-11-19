# MongoDB Restore Script for Raspberry Pi Database
# This script restores a MongoDB backup to the Raspberry Pi instance

# Configuration
$MONGO_HOST = "192.168.0.31:27017"
$BACKUP_DIR = "C:\backups\mongodb"
$LOG_FILE = "$BACKUP_DIR\restore.log"
$MONGORESTORE_PATH = "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe"

# Function to write log
function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LOG_FILE -Value $logMessage
}

# Check if mongorestore is available
if (-not (Test-Path $MONGORESTORE_PATH)) {
    Write-Log "ERROR: mongorestore not found at $MONGORESTORE_PATH"
    Write-Log "Please update MONGORESTORE_PATH variable or install MongoDB Database Tools."
    Write-Log "Download from: https://www.mongodb.com/try/download/database-tools"
    exit 1
}

# List available backups
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MongoDB Restore - Available Backups" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$backups = Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.zip" | Sort-Object LastWriteTime -Descending

if ($backups.Count -eq 0) {
    Write-Log "ERROR: No backups found in $BACKUP_DIR"
    exit 1
}

# Display backups with numbers
for ($i = 0; $i -lt $backups.Count; $i++) {
    $backup = $backups[$i]
    $size = ($backup.Length / 1MB).ToString("N2")
    $date = $backup.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "$($i + 1). $($backup.Name) - $size MB - $date"
}

Write-Host ""
Write-Host "0. Cancel" -ForegroundColor Yellow
Write-Host ""

# Prompt user to select backup
do {
    $selection = Read-Host "Select backup to restore (1-$($backups.Count))"
    $selectionNum = [int]$selection
} while ($selectionNum -lt 0 -or $selectionNum -gt $backups.Count)

if ($selectionNum -eq 0) {
    Write-Log "Restore cancelled by user"
    exit 0
}

$selectedBackup = $backups[$selectionNum - 1]
Write-Log "Selected backup: $($selectedBackup.Name)"

# Confirm restore
Write-Host ""
Write-Host "WARNING: This will restore the database on $MONGO_HOST" -ForegroundColor Red
Write-Host "All current data will be replaced with the backup data!" -ForegroundColor Red
Write-Host ""
$confirm = Read-Host "Are you sure you want to continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Log "Restore cancelled by user"
    exit 0
}

# Extract backup
Write-Log "Extracting backup..."
$tempDir = "$BACKUP_DIR\temp_restore"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
    Expand-Archive -Path $selectedBackup.FullName -DestinationPath $tempDir -Force
    Write-Log "Backup extracted successfully"

    # Find the dump directory
    $dumpDir = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1

    # Restore to MongoDB
    Write-Log "Starting restore to MongoDB at $MONGO_HOST..."
    Write-Host ""
    Write-Host "Restoring database..." -ForegroundColor Yellow

    & $MONGORESTORE_PATH --host=$MONGO_HOST --dir="$($dumpDir.FullName)" --drop 2>&1 | ForEach-Object {
        Write-Log $_
        Write-Host $_
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: mongorestore failed with exit code $LASTEXITCODE"
        throw "Restore failed"
    }

    Write-Log "Database restored successfully from $($selectedBackup.Name)"
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Restore completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green

} catch {
    Write-Log "ERROR: Restore failed: $_"
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: Restore failed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp directory
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir
        Write-Log "Cleaned up temporary files"
    }
}

Write-Log "----------------------------------------"