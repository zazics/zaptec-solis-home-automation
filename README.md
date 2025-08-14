# Test Module Waveshare USB to RS485

Programme Node.js pour tester la communication avec un module Waveshare USB to RS485 sous Windows.

## Installation

1. Installer Node.js (https://nodejs.org/)
2. Installer les dépendances :
   ```cmd
   npm install
   ```

## Utilisation

### Test basique RS485

```cmd
# Test sur COM3 à 9600 bauds
node rs485-test.js

# Test personnalisé
node rs485-test.js --port=COM1 --baud=115200
```

### Test Modbus RTU

```cmd
# Test Modbus sur COM3, slave ID 1
node modbus-test.js

# Test personnalisé
node modbus-test.js --port=COM1 --baud=115200 --slave=2
```

## Configuration

### Paramètres supportés

- `--port=COMx` : Port série (défaut: COM3)
- `--baud=xxxx` : Vitesse de transmission (défaut: 9600)
- `--slave=x` : ID de l'esclave Modbus (défaut: 1)

### Paramètres série par défaut

- Data bits: 8
- Stop bits: 1
- Parity: None
- Flow control: None

## Fonctionnalités

### RS485Tester
- Liste des ports série disponibles
- Connexion/déconnexion
- Envoi de données hexadécimales
- Envoi de texte
- Réception et affichage des données

### ModbusRTUTester
- Lecture de registres d'entrée (fonction 0x04)
- Lecture de registres de maintien (fonction 0x03)
- Écriture de registre simple (fonction 0x06)
- Calcul automatique du CRC
- Gestion des timeouts

## Exemple d'utilisation programmatique

```javascript
const RS485Tester = require('./rs485-test');

async function test() {
    const tester = new RS485Tester('COM3', { baudRate: 9600 });
    
    try {
        await tester.connect();
        await tester.sendText('Hello World!');
        await tester.sendData('01 03 00 00 00 01 84 0A');
    } finally {
        await tester.disconnect();
    }
}
```

## Dépannage

### Port non trouvé
- Vérifier que le module est connecté
- Utiliser le Gestionnaire de périphériques Windows pour identifier le port COM
- Essayer différents ports (COM1, COM2, COM3, etc.)

### Pas de réponse
- Vérifier les paramètres de communication (baud rate, parity, etc.)
- Vérifier le câblage RS485 (A, B, GND)
- Vérifier l'alimentation du dispositif esclave
- Augmenter le timeout de réponse

### Erreur de permission
- Fermer tous les programmes utilisant le port série
- Redémarrer en tant qu'administrateur si nécessaire

## Structure des fichiers

- `rs485-test.js` : Programme principal de test RS485
- `modbus-test.js` : Tests spécifiques Modbus RTU  
- `package.json` : Configuration du projet Node.js