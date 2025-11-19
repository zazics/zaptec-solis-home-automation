#!/bin/bash
# Script Bash pour configurer CouchDB sur OrangePi Zero (ARMhf)
# Compatible avec CouchDB dans Docker (treehouses/rpi-couchdb)
# Cree les bases de donnees et les index necessaires

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration par defaut (correspond a install-orangepi.md)
COUCHDB_URL="${1:-http://admin:admin@localhost:5984}"

echo -e "${GREEN}=== Configuration de CouchDB pour Zaptec-Solis ===${NC}"
echo -e "${CYAN}URL CouchDB: $COUCHDB_URL${NC}"

# Fonction pour creer une base de donnees
create_database() {
    local db_name=$1

    response=$(curl -s -w "\n%{http_code}" -X PUT "$COUCHDB_URL/$db_name" 2>&1)
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "201" ]; then
        echo -e "${GREEN}[OK] Base de donnees '$db_name' creee${NC}"
    elif [ "$http_code" = "412" ]; then
        echo -e "${YELLOW}[INFO] Base de donnees '$db_name' existe deja${NC}"
    elif [ "$http_code" = "401" ]; then
        echo -e "${RED}[ERREUR] Acces refuse pour '$db_name'. Verifiez les identifiants.${NC}"
    else
        echo -e "${RED}[ERREUR] Erreur lors de la creation de '$db_name' (HTTP $http_code)${NC}"
        # Afficher la reponse pour debug
        if [ "$http_code" != "201" ] && [ "$http_code" != "412" ]; then
            echo -e "${RED}Reponse: $(echo "$response" | head -n-1)${NC}"
        fi
    fi
}

# Fonction pour creer un index
create_index() {
    local db_name=$1
    local index_name=$2
    shift 2
    local fields=("$@")

    # Construire le JSON pour les champs
    fields_json="["
    for i in "${!fields[@]}"; do
        if [ $i -gt 0 ]; then
            fields_json+=","
        fi
        fields_json+="\"${fields[$i]}\""
    done
    fields_json+="]"

    # Corps de la requete
    body="{\"index\":{\"fields\":$fields_json},\"name\":\"$index_name\"}"

    response=$(curl -s -w "\n%{http_code}" -X POST "$COUCHDB_URL/$db_name/_index" \
        -H "Content-Type: application/json" \
        -d "$body" 2>&1)
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}  [OK] Index '$index_name' cree sur $db_name${NC}"
    elif [ "$http_code" = "401" ]; then
        echo -e "${RED}  [ERREUR] Acces refuse pour creer l'index '$index_name'. Verifiez les identifiants.${NC}"
    else
        echo -e "${RED}  [ERREUR] Erreur lors de la creation de l'index '$index_name' (HTTP $http_code)${NC}"
        # Afficher la reponse pour debug
        if [ "$http_code" != "200" ]; then
            echo -e "${RED}  Reponse: $(echo "$response" | head -n-1)${NC}"
        fi
    fi
}

# Verifier que curl est installe
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Erreur: curl n'est pas installe. Installez-le avec: sudo apt-get install curl${NC}"
    exit 1
fi

# Verifier la connexion a CouchDB
echo -e "\n${CYAN}Verification de la connexion a CouchDB...${NC}"

# Verifier si le conteneur Docker est en cours d'execution
if command -v docker &> /dev/null; then
    if ! docker ps | grep -q couchdb; then
        echo -e "${YELLOW}! Le conteneur CouchDB Docker n'est pas en cours d'execution${NC}"
        echo -e "${CYAN}Tentative de demarrage du conteneur...${NC}"
        docker start couchdb 2>/dev/null || {
            echo -e "${RED}[ERREUR] Echec du demarrage du conteneur. Executez d'abord les commandes d'installation depuis install-orangepi.md${NC}"
            exit 1
        }
        echo -e "${GREEN}[OK] Conteneur CouchDB demarre${NC}"
        sleep 3  # Attendre que CouchDB soit pret
    else
        echo -e "${GREEN}[OK] Conteneur CouchDB est en cours d'execution${NC}"
    fi
fi

# Verifier la connexion HTTP
response=$(curl -s -w "\n%{http_code}" "$COUCHDB_URL" 2>&1)
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}[OK] Connexion reussie a CouchDB${NC}"
elif [ "$http_code" = "401" ]; then
    echo -e "${RED}[ERREUR] Authentification refusee. Verifiez les identifiants dans l'URL.${NC}"
    echo -e "${YELLOW}Format attendu: http://user:password@host:port${NC}"
    exit 1
else
    echo -e "${RED}[ERREUR] Impossible de se connecter a CouchDB (HTTP $http_code)${NC}"
    echo -e "${YELLOW}Si vous utilisez Docker:${NC}"
    echo -e "${YELLOW}  1. Verifiez que le conteneur est en cours d'execution: docker ps${NC}"
    echo -e "${YELLOW}  2. Demarrez-le si necessaire: docker start couchdb${NC}"
    echo -e "${YELLOW}  3. Verifiez les logs: docker logs couchdb${NC}"
    exit 1
fi

# Creer les bases de donnees
echo -e "\n${CYAN}Creation des bases de donnees...${NC}"
create_database "solis_data"
create_database "zaptec_data"
create_database "hourly_aggregations"
create_database "daily_aggregations"

# Creer les index
echo -e "\n${CYAN}Creation des index...${NC}"

echo -e "\n${YELLOW}Solis Data:${NC}"
create_index "solis_data" "type-timestamp-index" "type" "timestamp"

echo -e "\n${YELLOW}Zaptec Data:${NC}"
create_index "zaptec_data" "type-timestamp-index" "type" "timestamp"

echo -e "\n${YELLOW}Hourly Aggregations:${NC}"
create_index "hourly_aggregations" "type-date-hour-index" "type" "date" "hour"

echo -e "\n${YELLOW}Daily Aggregations:${NC}"
create_index "daily_aggregations" "type-date-index" "type" "date"

echo -e "\n${GREEN}=== Configuration terminee ===${NC}"
echo -e "${CYAN}Vous pouvez maintenant utiliser CouchDB avec DATABASE_TYPE=couchdb${NC}"
echo -e "${CYAN}Verifiez l'installation avec: curl $COUCHDB_URL/_all_dbs${NC}"
