# Scripts de configuration

## setup-couchdb.ps1 (Windows/PowerShell)

Script PowerShell pour configurer CouchDB sur Windows.

### Utilisation

```powershell
# Avec les identifiants par défaut (admin:admin)
.\scripts\setup-couchdb.ps1

# Avec des identifiants personnalisés
.\scripts\setup-couchdb.ps1 -CouchDBUrl "http://admin:motdepasse@localhost:5984"
```

## setup-couchdb.sh (Linux/OrangePi)

Script Bash pour configurer CouchDB sur OrangePi Zero (ARMhf).
Compatible avec CouchDB dans Docker (treehouses/rpi-couchdb).

### Utilisation

```bash
# Rendre le script exécutable
chmod +x scripts/setup-couchdb.sh

# Avec les identifiants par défaut (admin:admin)
./scripts/setup-couchdb.sh

# Avec des identifiants personnalisés
./scripts/setup-couchdb.sh "http://admin:motdepasse@localhost:5984"
```

### Fonctionnalités

Les deux scripts effectuent les opérations suivantes :

1. **Vérification de la connexion** à CouchDB
2. **Création des bases de données** :
   - `solis_data` - Données de l'onduleur Solis
   - `zaptec_data` - Données du chargeur Zaptec
   - `hourly_aggregations` - Agrégations horaires
   - `daily_aggregations` - Agrégations quotidiennes
3. **Création des index** pour optimiser les requêtes :
   - Index `type-timestamp` pour les données Solis et Zaptec
   - Index `type-date-hour` pour les agrégations horaires
   - Index `type-date` pour les agrégations quotidiennes

### Prérequis

**Windows:**
- PowerShell 5.0+
- CouchDB installé et en cours d'exécution

**Linux/OrangePi:**
- Bash
- curl installé (`sudo apt-get install curl`)
- CouchDB en cours d'exécution (natif ou Docker)

### Dépannage

**Erreur de connexion:**
```bash
# Vérifier que CouchDB est démarré
docker ps | grep couchdb

# Démarrer le conteneur si nécessaire
docker start couchdb

# Vérifier les logs
docker logs couchdb
```

**Base de données déjà existante:**
Le script affichera un avertissement mais continuera l'exécution.

**Erreur de permissions:**
```bash
# S'assurer que le script est exécutable
chmod +x scripts/setup-couchdb.sh
```
