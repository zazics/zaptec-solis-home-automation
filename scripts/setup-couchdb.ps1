# Script PowerShell pour configurer CouchDB
# Cree les bases de donnees et les index necessaires

param(
    [string]$CouchDBUrl = "http://admin:admin@localhost:5984"
)

# Extraire les credentials de l'URL
if ($CouchDBUrl -match "http://([^:]+):([^@]+)@(.+)") {
    $username = $matches[1]
    $password = $matches[2]
    $baseUrl = "http://$($matches[3])"

    # Creer les credentials pour Basic Auth
    $pair = "${username}:${password}"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
    $base64 = [System.Convert]::ToBase64String($bytes)
    $authHeader = @{
        Authorization = "Basic $base64"
    }
} else {
    Write-Host "Erreur: Format d'URL invalide. Utilisez: http://user:password@host:port" -ForegroundColor Red
    exit 1
}

Write-Host "=== Configuration de CouchDB pour Zaptec-Solis ===" -ForegroundColor Green
Write-Host "URL CouchDB: $baseUrl" -ForegroundColor Cyan
Write-Host "Utilisateur: $username" -ForegroundColor Cyan

# Fonction pour creer une base de donnees
function Create-Database {
    param([string]$DbName)

    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/$DbName" `
            -Method Put `
            -Headers $authHeader `
            -ErrorAction Stop
        Write-Host "[OK] Base de donnees '$DbName' creee" -ForegroundColor Green
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 412) {
            Write-Host "[INFO] Base de donnees '$DbName' existe deja" -ForegroundColor Yellow
        }
        elseif ($statusCode -eq 401) {
            Write-Host "[ERREUR] Acces refuse pour '$DbName'. Verifiez les identifiants." -ForegroundColor Red
        }
        else {
            Write-Host "[ERREUR] Erreur lors de la creation de '$DbName': $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# Fonction pour creer un index
function Create-Index {
    param(
        [string]$DbName,
        [string]$IndexName,
        [array]$Fields
    )

    $body = @{
        index = @{
            fields = $Fields
        }
        name = $IndexName
    } | ConvertTo-Json -Depth 10

    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/$DbName/_index" `
            -Method Post `
            -Headers $authHeader `
            -Body $body `
            -ContentType "application/json; charset=utf-8" `
            -ErrorAction Stop
        Write-Host "  [OK] Index '$IndexName' cree sur $DbName" -ForegroundColor Green
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-Host "  [ERREUR] Acces refuse pour creer l'index '$IndexName'. Verifiez les identifiants." -ForegroundColor Red
        }
        else {
            Write-Host "  [ERREUR] Erreur lors de la creation de l'index '$IndexName': $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# Verifier la connexion a CouchDB
Write-Host "`nVerification de la connexion a CouchDB..." -ForegroundColor Cyan
try {
    $testResponse = Invoke-WebRequest -Uri $baseUrl -Headers $authHeader -ErrorAction Stop
    Write-Host "[OK] Connexion reussie" -ForegroundColor Green
}
catch {
    Write-Host "[ERREUR] Impossible de se connecter a CouchDB sur $baseUrl" -ForegroundColor Red
    Write-Host "Verifiez que CouchDB est demarre et que les identifiants sont corrects" -ForegroundColor Yellow
    exit 1
}

# Creer les bases de donnees
Write-Host "`nCreation des bases de donnees..." -ForegroundColor Cyan
Create-Database "solis_data"
Create-Database "zaptec_data"
Create-Database "hourly_aggregations"
Create-Database "daily_aggregations"

# Creer les index
Write-Host "`nCreation des index..." -ForegroundColor Cyan

Write-Host "`nSolis Data:" -ForegroundColor Yellow
Create-Index "solis_data" "type-timestamp-index" @("type", "timestamp")

Write-Host "`nZaptec Data:" -ForegroundColor Yellow
Create-Index "zaptec_data" "type-timestamp-index" @("type", "timestamp")

Write-Host "`nHourly Aggregations:" -ForegroundColor Yellow
Create-Index "hourly_aggregations" "type-date-hour-index" @("type", "date", "hour")

Write-Host "`nDaily Aggregations:" -ForegroundColor Yellow
Create-Index "daily_aggregations" "type-date-index" @("type", "date")

Write-Host "`n=== Configuration terminee ===" -ForegroundColor Green
Write-Host "Vous pouvez maintenant utiliser CouchDB avec DATABASE_TYPE=couchdb" -ForegroundColor Cyan
Write-Host "Verifiez l'installation avec: Invoke-WebRequest -Uri '$baseUrl/_all_dbs' -Headers @{Authorization='Basic $base64'}" -ForegroundColor Cyan
