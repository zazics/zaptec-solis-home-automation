# MongoDB Backup Script for Raspberry Pi Database
# This script connects to the MongoDB instance on Raspberry Pi and creates daily backups

# Configuration
$MONGO_HOST = "192.168.0.31:27017"
$BACKUP_DIR = "C:\backups\mongodb"
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$RETENTION_DAYS = 7
$LOG_FILE = "$BACKUP_DIR\backup.log"
$MONGODUMP_PATH = "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"

# Function to write log
function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LOG_FILE -Value $logMessage
}

# Create backup directory if it doesn't exist
try {
    New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
    Write-Log "Backup directory ready: $BACKUP_DIR"
} catch {
    Write-Log "ERROR: Failed to create backup directory: $_"
    exit 1
}

# Check if mongodump is available
if (-not (Test-Path $MONGODUMP_PATH)) {
    Write-Log "ERROR: mongodump not found at $MONGODUMP_PATH"
    Write-Log "Please update MONGODUMP_PATH variable or install MongoDB Database Tools."
    Write-Log "Download from: https://www.mongodb.com/try/download/database-tools"
    exit 1
}

# Start backup
Write-Log "Starting backup from MongoDB at $MONGO_HOST..."

try {
    # Run mongodump
    $dumpPath = "$BACKUP_DIR\backup_$DATE"
    & $MONGODUMP_PATH --host=$MONGO_HOST --out="$dumpPath" 2>&1 | ForEach-Object {
        Write-Log $_
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: mongodump failed with exit code $LASTEXITCODE"
        exit 1
    }

    Write-Log "Database dump completed successfully"

    # Compress the backup
    Write-Log "Compressing backup..."
    $zipPath = "$BACKUP_DIR\backup_$DATE.zip"
    Compress-Archive -Path $dumpPath -DestinationPath $zipPath -Force

    # Remove uncompressed dump
    Remove-Item -Recurse -Force $dumpPath

    $zipSize = (Get-Item $zipPath).Length / 1MB
    Write-Log "Backup compressed successfully: backup_$DATE.zip (${zipSize:N2} MB)"

    # Clean up old backups
    Write-Log "Cleaning up backups older than $RETENTION_DAYS days..."
    $deletedCount = 0
    Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.zip" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RETENTION_DAYS) } |
        ForEach-Object {
            Write-Log "Deleting old backup: $($_.Name)"
            Remove-Item -Force $_.FullName
            $deletedCount++
        }

    if ($deletedCount -eq 0) {
        Write-Log "No old backups to clean up"
    } else {
        Write-Log "Deleted $deletedCount old backup(s)"
    }

    # Summary
    $backupCount = (Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.zip").Count
    Write-Log "Backup completed successfully. Total backups: $backupCount"
    Write-Log "----------------------------------------"

} catch {
    Write-Log "ERROR: Backup failed: $_"
    exit 1
}