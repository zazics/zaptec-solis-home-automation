# CouchDB Restore Script for OrangePi Database
# This script restores a CouchDB backup to the OrangePi instance

# Configuration
$COUCHDB_HOST = "192.168.0.151"
$COUCHDB_PORT = "5984"
$COUCHDB_USER = "admin"
$COUCHDB_PASSWORD = "admin"
$BACKUP_DIR = "C:\backups\couchdb"
$LOG_FILE = "$BACKUP_DIR\restore.log"

# Base URL
$COUCHDB_URL = "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@${COUCHDB_HOST}:${COUCHDB_PORT}"

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

# List available backups
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CouchDB Restore - Available Backups" -ForegroundColor Cyan
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
Write-Host "WARNING: This will restore the databases on ${COUCHDB_HOST}:${COUCHDB_PORT}" -ForegroundColor Red
Write-Host "All current data in the following databases will be DELETED:" -ForegroundColor Red
Write-Host "  - solis_data" -ForegroundColor Red
Write-Host "  - zaptec_data" -ForegroundColor Red
Write-Host "  - hourly_aggregations" -ForegroundColor Red
Write-Host "  - daily_aggregations" -ForegroundColor Red
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

    # Find the backup directory
    $backupContentDir = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1

    # Get all JSON files (one per database)
    $jsonFiles = Get-ChildItem -Path $backupContentDir.FullName -Filter "*.json"

    if ($jsonFiles.Count -eq 0) {
        throw "No database backup files found in the archive"
    }

    Write-Log "Found $($jsonFiles.Count) database(s) to restore"
    Write-Host ""

    $totalDocs = 0
    $successCount = 0
    $errorCount = 0

    foreach ($jsonFile in $jsonFiles) {
        $dbName = [System.IO.Path]::GetFileNameWithoutExtension($jsonFile.Name)
        Write-Log "Restoring database: $dbName"

        try {
            # Read backup data
            $backupData = Get-Content -Path $jsonFile.FullName -Raw | ConvertFrom-Json

            # Delete existing database
            Write-Log "  Deleting existing database..."
            try {
                Invoke-RestMethod -Uri "$COUCHDB_URL/$dbName" -Method Delete -ErrorAction SilentlyContinue | Out-Null
            } catch {
                # Ignore error if database doesn't exist
            }

            # Create database
            Write-Log "  Creating database..."
            Invoke-RestMethod -Uri "$COUCHDB_URL/$dbName" -Method Put -ErrorAction Stop | Out-Null

            # Restore documents using bulk API
            if ($backupData.rows -and $backupData.rows.Count -gt 0) {
                Write-Log "  Restoring $($backupData.rows.Count) documents..."

                # Prepare bulk docs (remove _rev to avoid conflicts)
                $docs = @()
                foreach ($row in $backupData.rows) {
                    if ($row.doc) {
                        $doc = $row.doc.PSObject.Copy()
                        # Remove _rev but keep _id
                        $doc.PSObject.Properties.Remove('_rev')
                        $docs += $doc
                    }
                }

                if ($docs.Count -gt 0) {
                    # Bulk insert in batches of 500
                    $batchSize = 500
                    $batches = [math]::Ceiling($docs.Count / $batchSize)

                    for ($i = 0; $i -lt $batches; $i++) {
                        $start = $i * $batchSize
                        $end = [math]::Min(($i + 1) * $batchSize, $docs.Count)
                        $batch = $docs[$start..($end - 1)]

                        $bulkData = @{
                            docs = $batch
                        } | ConvertTo-Json -Depth 100

                        $response = Invoke-RestMethod -Uri "$COUCHDB_URL/$dbName/_bulk_docs" `
                            -Method Post `
                            -Body $bulkData `
                            -ContentType "application/json" `
                            -ErrorAction Stop

                        Write-Host "    Batch $($i + 1)/$batches completed" -ForegroundColor Gray
                    }

                    Write-Log "  [OK] Restored $($docs.Count) documents"
                    $totalDocs += $docs.Count
                }
            } else {
                Write-Log "  [INFO] Database is empty, no documents to restore"
            }

            $successCount++

        } catch {
            Write-Log "  [ERROR] Failed to restore $dbName : $_"
            $errorCount++
        }
    }

    Write-Log "Restore completed: $successCount successful, $errorCount errors"
    Write-Log "Total documents restored: $totalDocs"

    Write-Host ""
    if ($errorCount -eq 0) {
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Restore completed successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "Restore completed with errors!" -ForegroundColor Yellow
        Write-Host "Check the log file for details." -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
    }

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
