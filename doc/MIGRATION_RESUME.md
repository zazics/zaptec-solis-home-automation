# Résumé de la migration - Abstraction de base de données

## 📋 Vue d'ensemble

Le projet a été restructuré pour permettre de basculer facilement entre **MongoDB** et **CouchDB** sans modifier le code métier.

## ✅ Fichiers créés

### Interfaces (4 fichiers)
- `src/common/database/interfaces/solis-database.interface.ts`
- `src/common/database/interfaces/zaptec-database.interface.ts`
- `src/common/database/interfaces/hourly-aggregation-database.interface.ts`
- `src/common/database/interfaces/daily-aggregation-database.interface.ts`

### Implémentations MongoDB (4 fichiers)
- `src/common/database/mongodb/solis-mongodb.service.ts`
- `src/common/database/mongodb/zaptec-mongodb.service.ts`
- `src/common/database/mongodb/hourly-aggregation-mongodb.service.ts`
- `src/common/database/mongodb/daily-aggregation-mongodb.service.ts`

### Implémentations CouchDB (4 fichiers)
- `src/common/database/couchdb/solis-couchdb.service.ts`
- `src/common/database/couchdb/zaptec-couchdb.service.ts`
- `src/common/database/couchdb/hourly-aggregation-couchdb.service.ts`
- `src/common/database/couchdb/daily-aggregation-couchdb.service.ts`

### Configuration (2 fichiers)
- `src/common/database/database.constants.ts` - Tokens d'injection
- `src/common/database/database.module.ts` - Module dynamique

### Scripts (3 fichiers)
- `scripts/setup-couchdb.ps1` - Configuration CouchDB Windows
- `scripts/setup-couchdb.sh` - Configuration CouchDB Linux/OrangePi
- `scripts/README.md` - Documentation des scripts

### Documentation (3 fichiers)
- `DATABASE_SWITCH.md` - Guide rapide de configuration
- `doc/database-abstraction.md` - Documentation complète
- `doc/install-orangepi.md` - Mis à jour avec étapes CouchDB

## 🔧 Fichiers modifiés

### Services (4 fichiers)
- `src/solis/solis-data.service.ts` - Utilise l'interface au lieu du model MongoDB
- `src/zaptec/zaptec-data.service.ts` - Utilise l'interface au lieu du model MongoDB
- `src/common/services/hourly-aggregation.service.ts` - Utilise l'interface
- `src/common/services/daily-aggregation.service.ts` - Utilise l'interface

## 🚀 Comment utiliser

### Rester avec MongoDB (défaut)
Aucune action requise ! Le système continue de fonctionner comme avant.

### Basculer vers CouchDB

#### 1. Installer les dépendances
```bash
npm install nano
```

#### 2. Configurer .env
```env
DATABASE_TYPE=couchdb
COUCHDB_URL=http://admin:admin@localhost:5984
```

#### 3. Mettre à jour app.module.ts

Remplacer l'import du DatabaseModule par :

```typescript
import { DatabaseModule } from './common/database/database.module';
import { DatabaseType } from './common/database/database.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB conditionnel
    ...(process.env.DATABASE_TYPE === 'mongodb'
      ? [MongooseModule.forRoot(process.env.MONGODB_URI)]
      : []),

    // DatabaseModule avec sélection automatique
    DatabaseModule.forRoot(
      process.env.DATABASE_TYPE === 'couchdb' ? DatabaseType.COUCHDB : DatabaseType.MONGODB,
      process.env.DATABASE_TYPE === 'couchdb'
        ? { url: process.env.COUCHDB_URL }
        : undefined
    ),
  ],
})
```

#### 4. Configurer CouchDB

**Windows:**
```powershell
.\scripts\setup-couchdb.ps1
```

**Linux/OrangePi:**
```bash
chmod +x scripts/setup-couchdb.sh
./scripts/setup-couchdb.sh
```

## 🎯 Principes architecturaux

1. **Separation of Concerns** : La logique métier est séparée de l'implémentation de la base de données
2. **Dependency Injection** : Les services reçoivent l'implémentation via des tokens
3. **Interface Segregation** : Chaque type de données a sa propre interface
4. **Open/Closed Principle** : Facile d'ajouter de nouvelles implémentations sans modifier le code existant

## 📊 Comparaison MongoDB vs CouchDB

| Critère | MongoDB | CouchDB |
|---------|---------|---------|
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Agrégations** | Pipeline natif | Calculs manuels |
| **Réplication** | Possible | Facile (multi-maître) |
| **Ressources** | Gourmand | Léger |
| **Idéal pour** | Production intensive | OrangePi, Edge computing |

## 🔄 Prochaines étapes possibles

- [ ] Créer des scripts de migration de données MongoDB → CouchDB
- [ ] Créer des scripts de migration de données CouchDB → MongoDB
- [ ] Ajouter des tests unitaires pour chaque implémentation
- [ ] Ajouter support PostgreSQL (optionnel)
- [ ] Ajouter support Redis pour le cache (optionnel)

## ⚠️ Points d'attention

1. **Les schémas MongoDB** restent dans `src/*/schemas/` mais ne sont utilisés que par l'implémentation MongoDB
2. **CouchDB nécessite des index manuels** créés par le script de configuration
3. **Les agrégations CouchDB** sont moins performantes (calculs manuels vs pipeline MongoDB)
4. **La migration de données** nécessite un script séparé (à créer si besoin)

## 💡 Support

- **Basculer entre bases** : Voir [DATABASE_SWITCH.md](DATABASE_SWITCH.md)
- **Documentation complète** : Voir [doc/database-abstraction.md](doc/database-abstraction.md)
- **Installation OrangePi** : Voir [doc/install-orangepi.md](doc/install-orangepi.md)
- **Scripts** : Voir [scripts/README.md](scripts/README.md)
