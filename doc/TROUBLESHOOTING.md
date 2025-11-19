# Dépannage - Database Abstraction

## Erreur: "Can't resolve dependencies... DatabaseConnection"

### Symptôme
```
Error: Nest can't resolve dependencies of the XxxDataModel (?).
Please make sure that the argument "DatabaseConnection" at index [0] is available in the MongooseModule context.
```

### Cause
Un module essaie toujours d'injecter un Model Mongoose alors que CouchDB est configuré.

### Solution

1. **Vérifier que tous les modules n'importent PLUS `MongooseModule.forFeature()`**

Les modules suivants NE DOIVENT PAS avoir `MongooseModule.forFeature()` :
- `src/solis/solis.module.ts`
- `src/zaptec/zaptec.module.ts`
- `src/chart/chart.module.ts`

✅ **Correct:**
```typescript
@Module({
  imports: [],  // Pas de MongooseModule ici !
  providers: [SolisService, SolisDataService],
  exports: [SolisService, SolisDataService],
})
```

❌ **Incorrect:**
```typescript
@Module({
  imports: [
    MongooseModule.forFeature([...])  // À SUPPRIMER !
  ],
  providers: [SolisService, SolisDataService],
})
```

2. **Vérifier le fichier `.env`**

```env
DATABASE_TYPE=couchdb
COUCHDB_URL=http://admin:admin@localhost:5984
```

3. **Vérifier les logs au démarrage**

Vous devriez voir:
```
[AppModule] === Database Configuration ===
[AppModule] DATABASE_TYPE: couchdb
[AppModule] Using: CouchDB
[AppModule] CouchDB URL: http://admin:admin@localhost:5984
```

Si vous voyez `MongoDB (default)`, la variable n'est pas lue correctement.

## Erreur: Module "nano" introuvable

### Solution
```bash
npm install nano
npm install --save-dev @types/nano
```

## Erreur 401 lors de la configuration CouchDB

### Symptôme
```
[ERREUR] Acces refuse. Verifiez les identifiants.
```

### Solution

1. **Vérifier que CouchDB est démarré**
```bash
# Docker
docker ps | grep couchdb
docker start couchdb

# Windows Service
net start couchdb
```

2. **Vérifier les identifiants dans l'URL**

Format correct: `http://user:password@host:port`

Exemple: `http://admin:admin@localhost:5984`

3. **Tester manuellement**
```bash
curl http://admin:admin@localhost:5984
```

Doit retourner:
```json
{
  "couchdb": "Welcome",
  "version": "3.x.x"
}
```

## CouchDB ne démarre pas (Docker)

### Solution
```bash
# Vérifier les logs
docker logs couchdb

# Redémarrer le conteneur
docker stop couchdb
docker rm couchdb

# Recréer selon install-orangepi.md
docker run -d \
  --name couchdb \
  -p 5984:5984 \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=admin \
  -v couchdb_data:/opt/couchdb/data \
  --memory=256m \
  treehouses/rpi-couchdb:2.3.1
```

## Les données ne sont pas sauvegardées

### Vérifier que les bases de données existent
```bash
curl http://admin:admin@localhost:5984/_all_dbs
```

Doit retourner:
```json
["daily_aggregations","hourly_aggregations","solis_data","zaptec_data"]
```

Si les bases n'existent pas, exécuter:
```bash
# Windows
.\scripts\setup-couchdb.ps1

# Linux/OrangePi
chmod +x scripts/setup-couchdb.sh
./scripts/setup-couchdb.sh
```

## Application ne démarre pas - Erreur de compilation

### Symptôme
```
Module not found: Can't resolve '../common/database/...'
```

### Solution
```bash
# Nettoyer et rebuild
rm -rf node_modules dist
npm install
npm run build
```

## Comment revenir à MongoDB

1. **Modifier `.env`**
```env
DATABASE_TYPE=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017/solis-automation
```

2. **Redémarrer l'application**

C'est tout ! L'application va automatiquement utiliser MongoDB.

## Logs de debug

Pour activer les logs détaillés:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

## Contact

Pour toute autre erreur, ouvrir une issue sur GitHub avec:
- Le message d'erreur complet
- Le contenu de votre `.env` (sans les mots de passe!)
- Les logs de démarrage de l'application
