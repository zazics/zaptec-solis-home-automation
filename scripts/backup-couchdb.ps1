# CouchDB Backup Script for OrangePi Database
# This script connects to the CouchDB instance on OrangePi and creates daily backups

# Configuration
$COUCHDB_HOST = "192.168.0.151"
$COUCHDB_PORT = "5984"
$COUCHDB_USER = "admin"
$COUCHDB_PASSWORD = "admin"
$BACKUP_DIR = "C:\backups\couchdb"
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$RETENTION_DAYS = 7
$LOG_FILE = "$BACKUP_DIR\backup.log"

# Base URL
$COUCHDB_URL = "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@${COUCHDB_HOST}:${COUCHDB_PORT}"

# Databases to backup
$DATABASES = @("solis_data", "zaptec_data", "hourly_aggregations", "daily_aggregations")

# Function to write log
function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    if (Test-Path $LOG_FILE) {
        Add-Content -Path $LOG_FILE -Value $logMessage
    }
}

# Create backup directory if it doesn't exist
try {
    New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
    Write-Log "Backup directory ready: $BACKUP_DIR"
} catch {
    Write-Log "ERROR: Failed to create backup directory: $_"
    exit 1
}

# Test CouchDB connection
Write-Log "Testing connection to CouchDB at ${COUCHDB_HOST}:${COUCHDB_PORT}..."
try {
    $testResponse = Invoke-RestMethod -Uri $COUCHDB_URL -Method Get -ErrorAction Stop
    Write-Log "Connected to CouchDB version $($testResponse.version)"
} catch {
    Write-Log "ERROR: Cannot connect to CouchDB: $_"
    Write-Log "Please check that:"
    Write-Log "  1. CouchDB is running: ssh root@$COUCHDB_HOST 'docker ps | grep couchdb'"
    Write-Log "  2. Host IP is correct: $COUCHDB_HOST"
    Write-Log "  3. Credentials are correct"
    exit 1
}

# Start backup
Write-Log "Starting backup from CouchDB..."
$backupPath = "$BACKUP_DIR\backup_$DATE"
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$totalDocs = 0
$successCount = 0
$errorCount = 0

foreach ($dbName in $DATABASES) {
    Write-Log "Backing up database: $dbName"

    try {
        # Get all documents with their content
        $url = "$COUCHDB_URL/${dbName}/_all_docs"
        $params = @{
            include_docs = "true"
        }

        $response = Invoke-RestMethod -Uri $url -Method Get -Body $params -ErrorAction Stop

        # Save to JSON file
        $outputFile = "$backupPath\${dbName}.json"
        $response | ConvertTo-Json -Depth 100 | Out-File -FilePath $outputFile -Encoding UTF8

        $docCount = $response.rows.Count
        $fileSize = (Get-Item $outputFile).Length / 1KB
        Write-Log "  [OK] Saved $docCount documents (${fileSize:N2} KB)"

        $totalDocs += $docCount
        $successCount++

    } catch {
        Write-Log "  [ERROR] Failed to backup $dbName : $_"
        $errorCount++
    }
}

Write-Log "Database dumps completed: $successCount successful, $errorCount errors"
Write-Log "Total documents backed up: $totalDocs"

# Compress the backup
Write-Log "Compressing backup..."
try {
    $zipPath = "$BACKUP_DIR\backup_$DATE.zip"
    Compress-Archive -Path $backupPath -DestinationPath $zipPath -Force

    # Remove uncompressed backup
    Remove-Item -Recurse -Force $backupPath

    $zipSize = (Get-Item $zipPath).Length / 1MB
    Write-Log "Backup compressed successfully: backup_$DATE.zip (${zipSize:N2} MB)"

} catch {
    Write-Log "ERROR: Failed to compress backup: $_"
    exit 1
}

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

if ($errorCount -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Some databases failed to backup. Check the log file." -ForegroundColor Yellow
    exit 1
}
