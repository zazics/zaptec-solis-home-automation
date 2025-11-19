# Basculer entre MongoDB et CouchDB

## Installation des dépendances

**MongoDB (déjà installé):**
```bash
npm install @nestjs/mongoose mongoose
```

**CouchDB (à installer si nécessaire):**
```bash
npm install nano
npm install --save-dev @types/nano
```

## Configuration

### 1. Variables d'environnement (.env)

**Pour MongoDB (par défaut):**
```env
DATABASE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017/zaptec-solis
```

**Pour CouchDB:**
```env
DATABASE_TYPE=couchdb
COUCHDB_URL=http://admin:password@localhost:5984
```

### 2. Mettre à jour app.module.ts

Remplacez l'import actuel du DatabaseModule par:

```typescript
import { DatabaseModule } from './common/database/database.module';
import { DatabaseType } from './common/database/database.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB (si DATABASE_TYPE=mongodb)
    ...(process.env.DATABASE_TYPE === 'mongodb'
      ? [MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/zaptec-solis')]
      : []),

    // Configuration du DatabaseModule selon DATABASE_TYPE
    DatabaseModule.forRoot(
      process.env.DATABASE_TYPE === 'couchdb' ? DatabaseType.COUCHDB : DatabaseType.MONGODB,
      process.env.DATABASE_TYPE === 'couchdb'
        ? { url: process.env.COUCHDB_URL }
        : undefined
    ),

    // ... autres modules
  ],
})
export class AppModule {}
```

### 3. Préparer CouchDB (première utilisation uniquement)

```powershell
# Démarrer CouchDB
net start couchdb

# Créer les bases de données et index
.\scripts\setup-couchdb.ps1
```

Ou manuellement:
```bash
curl -X PUT http://admin:password@localhost:5984/solis_data
curl -X PUT http://admin:password@localhost:5984/zaptec_data
curl -X PUT http://admin:password@localhost:5984/hourly_aggregations
curl -X PUT http://admin:password@localhost:5984/daily_aggregations
```

## Utilisation

1. Modifiez `DATABASE_TYPE` dans `.env`
2. Redémarrez l'application
3. Aucun changement de code nécessaire!

## Différences clés

| Fonctionnalité | MongoDB | CouchDB |
|----------------|---------|---------|
| Agrégations | Pipeline natif | Calculs manuels |
| Performance | Très rapide | Rapide |
| Réplication | Possible | Facile (multi-maître) |
| Ressources | Plus gourmand | Léger |
| API | Driver natif | HTTP/REST |

## C'est tout!

Les services (`SolisDataService`, `ZaptecDataService`, etc.) utilisent automatiquement la bonne implémentation.
