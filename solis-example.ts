#!/usr/bin/env ts-node

import { SolisInverter } from "./solis-inverter";

/**
 * Exemple d'utilisation de la classe SolisInverter haut niveau
 */
async function main() {
  const args = process.argv.slice(2);
  const defaultPort = process.platform === "win32" ? "COM4" : "/dev/ttyACM0";
  const portName = args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || defaultPort;
  const baudRate = parseInt(args.find((arg) => arg.startsWith("--baud="))?.split("=")[1] || "9600");
  const slaveId = parseInt(args.find((arg) => arg.startsWith("--slave="))?.split("=")[1] || "1");

  console.log("=== EXEMPLE UTILISATION CLASSE SOLIS HAUT NIVEAU ===\n");
  console.log(`Paramètres:`);
  console.log(`  Port: ${portName}`);
  console.log(`  Baud Rate: ${baudRate}`);
  console.log(`  Slave ID: ${slaveId}\n`);

  const solis = new SolisInverter(portName, {
    baudRate,
    slaveId,
    responseTimeout: 3000
  });

  try {
    // Connexion à l'onduleur
    console.log("🔌 Connexion à l'onduleur...");
    await solis.connect();
    console.log("✅ Connecté avec succès!\n");

    // Test de connectivité
    console.log("🧪 Test de connectivité...");
    const connected = await solis.testConnection();
    if (!connected) {
      console.log("❌ Test de connectivité échoué");
      return;
    }
    console.log("✅ Test de connectivité réussi!\n");

    // Récupération des données PV (panneaux solaires)
    console.log("☀️ === DONNÉES PANNEAUX SOLAIRES ===");
    try {
      const pvData = await solis.getPVData();
      console.log(`🔋 Puissance DC totale: ${pvData.totalPowerDC} W (${(pvData.totalPowerDC / 1000).toFixed(2)} kW)`);
      console.log(`📊 PV1: ${pvData.pv1.voltage}V × ${pvData.pv1.current}A = ${pvData.pv1.power.toFixed(1)}W`);
      console.log(`📊 PV2: ${pvData.pv2.voltage}V × ${pvData.pv2.current}A = ${pvData.pv2.power.toFixed(1)}W`);
    } catch (error) {
      console.log("❌ Erreur lecture données PV:", (error as Error).message);
    }
    console.log();

    // Récupération des données AC
    console.log("⚡ === DONNÉES PUISSANCE AC ===");
    try {
      const acData = await solis.getACData();
      console.log(`🔌 Puissance AC totale: ${acData.totalPowerAC} W (${(acData.totalPowerAC / 1000).toFixed(2)} kW)`);
      console.log(`🌡️ Température onduleur: ${acData.temperature}°C`);
      console.log(`📶 Fréquence: ${acData.frequency} Hz`);
    } catch (error) {
      console.log("❌ Erreur lecture données AC:", (error as Error).message);
    }
    console.log();

    // Récupération des données maison
    console.log("🏠 === DONNÉES CONSOMMATION MAISON ===");
    try {
      const houseData = await solis.getHouseData();
      console.log(`🏠 Consommation maison: ${houseData.consumption} W (${(houseData.consumption / 1000).toFixed(2)} kW)`);
      console.log(`🔌 Consommation backup: ${houseData.backupConsumption} W (${(houseData.backupConsumption / 1000).toFixed(2)} kW)`);
    } catch (error) {
      console.log("❌ Erreur lecture données maison:", (error as Error).message);
    }
    console.log();

    // Récupération des données réseau
    console.log("🔗 === DONNÉES RÉSEAU ÉLECTRIQUE ===");
    try {
      const gridData = await solis.getGridData();
      if (gridData.activePower > 0) {
        console.log(`↗️ Injection réseau: ${gridData.activePower} W (${(gridData.activePower / 1000).toFixed(2)} kW)`);
      } else {
        console.log(`↘️ Consommation réseau: ${Math.abs(gridData.activePower)} W (${(Math.abs(gridData.activePower) / 1000).toFixed(2)} kW)`);
      }
      
      if (gridData.inverterPower > 0) {
        console.log(`🔄 Onduleur → Réseau: ${gridData.inverterPower} W (${(gridData.inverterPower / 1000).toFixed(2)} kW)`);
      } else {
        console.log(`🔄 Réseau → Onduleur: ${Math.abs(gridData.inverterPower)} W (${(Math.abs(gridData.inverterPower) / 1000).toFixed(2)} kW)`);
      }
      
      console.log(`📈 Énergie exportée totale: ${gridData.exportedEnergyTotal.toFixed(1)} kWh`);
      console.log(`📉 Énergie importée totale: ${gridData.importedEnergyTotal.toFixed(1)} kWh`);
    } catch (error) {
      console.log("❌ Erreur lecture données réseau:", (error as Error).message);
    }
    console.log();

    // Récupération des données batterie
    console.log("🔋 === DONNÉES BATTERIE ===");
    try {
      const batteryData = await solis.getBatteryData();
      if (batteryData.power > 0) {
        console.log(`🔋➡️ Décharge batterie: ${batteryData.power} W (${(batteryData.power / 1000).toFixed(2)} kW)`);
      } else {
        console.log(`🔋⬅️ Charge batterie: ${Math.abs(batteryData.power)} W (${(Math.abs(batteryData.power) / 1000).toFixed(2)} kW)`);
      }
      console.log(`🔋 État de charge: ${batteryData.soc}%`);
      console.log(`🔋 Tension batterie: ${batteryData.voltage}V`);
      console.log(`🔋 Courant batterie: ${batteryData.current}A`);
    } catch (error) {
      console.log("❌ Erreur lecture données batterie:", (error as Error).message);
    }
    console.log();

    // Récupération du statut
    console.log("📊 === STATUT ONDULEUR ===");
    try {
      const status = await solis.getStatus();
      console.log(`📊 Statut: ${status.text} (${status.code})`);
    } catch (error) {
      console.log("❌ Erreur lecture statut:", (error as Error).message);
    }
    console.log();


  } catch (error) {
    console.error("❌ Erreur:", (error as Error).message);
  } finally {
    // Déconnexion
    console.log("\n🔌 Déconnexion...");
    await solis.disconnect();
    console.log("✅ Déconnecté");
  }
}

if (require.main === module) {
  console.log("Usage:");
  if (process.platform === "win32") {
    console.log("  ts-node solis-example.ts --port=COM1 --baud=9600 --slave=1");
  } else {
    console.log("  ts-node solis-example.ts --port=/dev/ttyACM0 --baud=9600 --slave=1");
  }
  console.log("");

  main().catch(console.error);
}