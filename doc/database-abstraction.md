# Database Abstraction Layer - Documentation

## Vue d'ensemble

Ce projet implémente une couche d'abstraction de base de données qui permet de basculer facilement entre MongoDB et CouchDB sans modifier le code métier.

## Architecture

### Structure des fichiers

```
src/common/database/
├── interfaces/                     # Interfaces d'abstraction
│   ├── solis-database.interface.ts
│   ├── zaptec-database.interface.ts
│   ├── hourly-aggregation-database.interface.ts
│   └── daily-aggregation-database.interface.ts
├── mongodb/                        # Implémentations MongoDB
│   ├── solis-mongodb.service.ts
│   ├── zaptec-mongodb.service.ts
│   ├── hourly-aggregation-mongodb.service.ts
│   └── daily-aggregation-mongodb.service.ts
├── couchdb/                        # Implémentations CouchDB
│   ├── solis-couchdb.service.ts
│   ├── zaptec-couchdb.service.ts
│   ├── hourly-aggregation-couchdb.service.ts
│   └── daily-aggregation-couchdb.service.ts
├── database.constants.ts           # Tokens d'injection et énumérations
└── database.module.ts              # Module dynamique pour la configuration
```

### Principes de conception

1. **Interface-based Design**: Chaque type de données (Solis, Zaptec, agrégations) a une interface définissant les opérations disponibles
2. **Dependency Injection**: Les services utilisent l'injection de dépendances via des tokens pour recevoir l'implémentation appropriée
3. **Factory Pattern**: Le `DatabaseModule` agit comme une factory qui fournit la bonne implémentation selon la configuration

## Configuration

### Prérequis

**Pour MongoDB:**
```bash
npm install @nestjs/mongoose mongoose
```

**Pour CouchDB:**
```bash
npm install nano
npm install --save-dev @types/nano
```

### Configurer le type de base de données

#### Option 1: Utiliser MongoDB (par défaut)

Dans votre `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from './common/database/database.module';
import { DatabaseType } from './common/database/database.constants';

@Module({
  imports: [
    // Configuration MongoDB globale
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/zaptec-solis'),

    // Initialisation du module de base de données avec MongoDB
    DatabaseModule.forRoot(DatabaseType.MONGODB),

    // Vos autres modules...
  ],
})
export class AppModule {}
```

#### Option 2: Utiliser CouchDB

Dans votre `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from './common/database/database.module';
import { DatabaseType } from './common/database/database.constants';

@Module({
  imports: [
    // Initialisation du module de base de données avec CouchDB
    DatabaseModule.forRoot(DatabaseType.COUCHDB, {
      url: process.env.COUCHDB_URL || 'http://admin:password@localhost:5984'
    }),

    // Vos autres modules...
  ],
})
export class AppModule {}
```

### Variables d'environnement

Ajoutez dans votre fichier `.env`:

**Pour MongoDB:**
```env
DATABASE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017/zaptec-solis
```

**Pour CouchDB:**
```env
DATABASE_TYPE=couchdb
COUCHDB_URL=http://admin:password@localhost:5984
```

### Configuration dynamique avec variables d'environnement

Pour permettre la configuration via `.env`, modifiez `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from './common/database/database.module';
import { DatabaseType } from './common/database/database.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Configuration conditionnelle de MongoDB
    ...(process.env.DATABASE_TYPE === 'mongodb'
      ? [MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/zaptec-solis')]
      : []),

    // Configuration du DatabaseModule selon la variable d'environnement
    DatabaseModule.forRoot(
      process.env.DATABASE_TYPE === 'couchdb' ? DatabaseType.COUCHDB : DatabaseType.MONGODB,
      process.env.DATABASE_TYPE === 'couchdb'
        ? { url: process.env.COUCHDB_URL }
        : undefined
    ),

    // Vos autres modules...
  ],
})
export class AppModule {}
```

## Mise à jour des modules existants

Les modules Solis et Zaptec doivent importer le `DatabaseModule`:

**Avant:**
```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SolisData.name, schema: SolisDataSchema }
    ]),
  ],
  providers: [SolisService, SolisDataService],
  exports: [SolisService, SolisDataService],
})
export class SolisModule {}
```

**Après:**
```typescript
@Module({
  // Le DatabaseModule est déjà global, pas besoin de l'importer ici
  providers: [SolisService, SolisDataService],
  exports: [SolisService, SolisDataService],
})
export class SolisModule {}
```

## Migration des données

### De MongoDB vers CouchDB

```bash
# Script de migration à créer
node scripts/migrate-mongo-to-couch.js
```

### De CouchDB vers MongoDB

```bash
# Script de migration à créer
node scripts/migrate-couch-to-mongo.js
```

## Préparation de CouchDB

Si vous utilisez CouchDB, vous devez créer les bases de données nécessaires:

```bash
# Créer les bases de données
curl -X PUT http://admin:password@localhost:5984/solis_data
curl -X PUT http://admin:password@localhost:5984/zaptec_data
curl -X PUT http://admin:password@localhost:5984/hourly_aggregations
curl -X PUT http://admin:password@localhost:5984/daily_aggregations

# Créer les index pour les requêtes de recherche
curl -X POST http://admin:password@localhost:5984/solis_data/_index \
  -H "Content-Type: application/json" \
  -d '{"index": {"fields": ["type", "timestamp"]}, "name": "type-timestamp-index"}'

curl -X POST http://admin:password@localhost:5984/zaptec_data/_index \
  -H "Content-Type: application/json" \
  -d '{"index": {"fields": ["type", "timestamp"]}, "name": "type-timestamp-index"}'

curl -X POST http://admin:password@localhost:5984/hourly_aggregations/_index \
  -H "Content-Type: application/json" \
  -d '{"index": {"fields": ["type", "date", "hour"]}, "name": "type-date-hour-index"}'

curl -X POST http://admin:password@localhost:5984/daily_aggregations/_index \
  -H "Content-Type: application/json" \
  -d '{"index": {"fields": ["type", "date"]}, "name": "type-date-index"}'
```

Ou utilisez le script PowerShell fourni:

```powershell
.\scripts\setup-couchdb.ps1
```

## Différences entre MongoDB et CouchDB

### MongoDB
- ✅ Requêtes d'agrégation puissantes (pipeline d'agrégation)
- ✅ Index automatiques et performants
- ✅ Transactions ACID
- ❌ Nécessite plus de mémoire
- ❌ Moins de tolérance aux pannes

### CouchDB
- ✅ Réplication multi-maître facile
- ✅ API HTTP/REST native
- ✅ Meilleure tolérance aux pannes
- ✅ Moins gourmand en ressources
- ❌ Pas de pipeline d'agrégation (calculs manuels nécessaires)
- ❌ Index à créer manuellement

## Utilisation dans le code

Les services existants (`SolisDataService`, `ZaptecDataService`, etc.) n'ont **pas besoin d'être modifiés**. Ils utilisent automatiquement l'implémentation configurée.

Exemple:

```typescript
@Injectable()
export class MyService {
  constructor(
    private readonly solisDataService: SolisDataService,
  ) {}

  async getRecentData() {
    // Fonctionne avec MongoDB ou CouchDB selon la configuration
    return await this.solisDataService.getRecentData(50);
  }
}
```

## Tests

### Tester avec MongoDB

```bash
DATABASE_TYPE=mongodb npm test
```

### Tester avec CouchDB

```bash
DATABASE_TYPE=couchdb npm test
```

## Dépannage

### Erreur: Cannot find module 'nano'
```bash
npm install nano @types/nano
```

### Erreur: CouchDB connection refused
Vérifiez que CouchDB est démarré:
```bash
# Windows
net start couchdb

# Linux/Mac
sudo service couchdb start
```

### Performance lente avec CouchDB
Assurez-vous que les index sont créés (voir section "Préparation de CouchDB")

## Prochaines étapes

1. ✅ Créer les interfaces d'abstraction
2. ✅ Implémenter MongoDB et CouchDB
3. ✅ Mettre à jour les services existants
4. ⏳ Créer les scripts de migration de données
5. ⏳ Ajouter des tests unitaires pour chaque implémentation
6. ⏳ Créer un script PowerShell pour la configuration CouchDB

## Support

Pour toute question, consultez:
- [Documentation MongoDB](https://docs.mongodb.com/)
- [Documentation CouchDB](https://docs.couchdb.org/)
- [Documentation NestJS](https://docs.nestjs.com/)
