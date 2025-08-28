/**
 * Classe utilitaire pour les opérations Modbus RTU bas niveau
 * Contient les méthodes communes pour le protocole Modbus RTU
 */
export class ModbusRTU {
  /**
   * Calcule le CRC16 pour les trames Modbus RTU
   * @param data - Données pour lesquelles calculer le CRC
   * @returns Tableau contenant les 2 bytes du CRC [Low, High]
   */
  public static calculateCRC(data: number[]): number[] {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]!;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xa001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    return [crc & 0xff, (crc >> 8) & 0xff];
  }

  /**
   * Crée une trame Modbus RTU complète avec CRC
   * @param slaveId - ID de l'esclave Modbus
   * @param functionCode - Code de fonction Modbus (ex: 0x03, 0x04)
   * @param startAddr - Adresse de début des registres
   * @param quantity - Nombre de registres à lire
   * @returns Trame Modbus complète prête à envoyer
   */
  public static createReadFrame(slaveId: number, functionCode: number, startAddr: number, quantity: number): Buffer {
    const frame = [
      slaveId,
      functionCode,
      (startAddr >> 8) & 0xff,
      startAddr & 0xff,
      (quantity >> 8) & 0xff,
      quantity & 0xff,
    ];
    const crc = this.calculateCRC(frame);
    return Buffer.from([...frame, ...crc]);
  }

  /**
   * Crée une trame Modbus RTU d'écriture avec CRC
   * @param slaveId - ID de l'esclave Modbus
   * @param functionCode - Code de fonction Modbus (ex: 0x06, 0x10)
   * @param startAddr - Adresse du registre à écrire
   * @param values - Valeurs à écrire
   * @returns Trame Modbus complète prête à envoyer
   */
  public static createWriteFrame(slaveId: number, functionCode: number, startAddr: number, values: number[]): Buffer {
    const frame = [slaveId, functionCode, (startAddr >> 8) & 0xff, startAddr & 0xff];

    if (functionCode === 0x06) {
      // Write Single Register
      frame.push((values[0]! >> 8) & 0xff, values[0]! & 0xff);
    } else if (functionCode === 0x10) {
      // Write Multiple Registers
      frame.push((values.length >> 8) & 0xff, values.length & 0xff);
      frame.push(values.length * 2); // Byte count
      for (const value of values) {
        frame.push((value >> 8) & 0xff, value & 0xff);
      }
    }

    const crc = this.calculateCRC(frame);
    return Buffer.from([...frame, ...crc]);
  }

  /**
   * Vérifie le CRC d'une réponse Modbus RTU complète
   * @param data - Données reçues incluant le CRC
   * @returns true si le CRC est valide, false sinon
   */
  public static verifyFrameCRC(data: Buffer): boolean {
    if (data.length < 3) return false;

    const frameData = Array.from(data.slice(0, data.length - 2));
    const receivedCRC = [data[data.length - 2]!, data[data.length - 1]!];
    const calculatedCRC = this.calculateCRC(frameData);

    return receivedCRC[0] === calculatedCRC[0] && receivedCRC[1] === calculatedCRC[1];
  }

  /**
   * Parse une réponse Modbus RTU standard
   * @param data - Données reçues
   * @returns Objet avec les informations parsées ou null si invalide
   */
  public static parseResponse(data: Buffer): ModbusResponse | null {
    if (!data || data.length < 5) return null;

    if (!this.verifyFrameCRC(data)) {
      return { error: 'CRC invalide' };
    }

    const slaveId = data[0]!;
    const functionCode = data[1]!;

    // Vérifier si c'est une réponse d'erreur
    if (functionCode & 0x80) {
      const exceptionCode = data[2]!;
      return {
        slaveId,
        functionCode: functionCode & 0x7f,
        error: `Exception ${exceptionCode}: ${this.getExceptionText(exceptionCode)}`,
      };
    }

    const dataLength = data[2]!;
    if (data.length < 3 + dataLength + 2) return null;

    const responseData = data.slice(3, 3 + dataLength);

    return {
      slaveId,
      functionCode,
      dataLength,
      data: responseData,
    };
  }

  /**
   * Vérifie si une trame Modbus RTU est complète
   * @param buffer - Buffer contenant les données reçues
   * @returns true si la trame est complète et valide
   */
  public static isFrameComplete(buffer: Buffer): boolean {
    // 1. MINIMUM SIZE: Au moins 5 bytes (Slave + Function + Length + CRC)
    if (buffer.length < 5) {
      return false;
    }

    const functionCode = buffer[1]!

    // 2. HANDLE ERROR RESPONSES: Format différent pour les erreurs
    if (functionCode & 0x80) {
      // Réponse d'erreur: [Slave][Function+0x80][Exception][CRC_Low][CRC_High] = 5 bytes
      if (buffer.length < 5) {
        return false;
      }
      // Vérifier CRC pour réponse d'erreur
      return this.verifyCRC(buffer, 5);
    }

    // 3. NORMAL RESPONSE: Extract expected length from byte 2
    const dataLength = buffer[2]!;
    const expectedTotalLength = 3 + dataLength + 2; // Header(3) + Data + CRC(2)

    // 4. CHECK if we have all expected bytes
    if (buffer.length < expectedTotalLength) {
      return false; // Still waiting for more data
    }

    // 5. VERIFY CRC for data integrity
    return this.verifyCRC(buffer, expectedTotalLength);
  }

  /**
   * Vérifie le CRC d'une trame Modbus
   * @param buffer - Buffer contenant la trame
   * @param length - Longueur attendue de la trame
   * @returns true si le CRC est correct
   */
  private static verifyCRC(buffer: Buffer, length: number): boolean {
    if (buffer.length < length) {
      return false;
    }

    // Extract received CRC (last 2 bytes, little-endian)
    const receivedCRCLow = buffer[length - 2]!;
    const receivedCRCHigh = buffer[length - 1]!;
    const receivedCRC = (receivedCRCHigh << 8) | receivedCRCLow;

    // Calculate expected CRC on all data except CRC bytes
    const dataForCRC = Array.from(buffer.slice(0, length - 2));
    const [expectedCRCLow, expectedCRCHigh] = this.calculateCRC(dataForCRC);
    const expectedCRC = (expectedCRCHigh << 8) | expectedCRCLow;

    return receivedCRC === expectedCRC;
  }

  /**
   * Convertit les données de registres en valeurs 16-bit
   * @param data - Données brutes des registres
   * @returns Tableau des valeurs des registres
   */
  public static parseRegisters(data: Buffer): number[] {
    const registers: number[] = [];
    for (let i = 0; i < data.length; i += 2) {
      if (i + 1 < data.length) {
        const value = (data[i]! << 8) | data[i + 1]!;
        registers.push(value);
      }
    }
    return registers;
  }

  /**
   * Convertit un Buffer en chaîne hexadécimale formatée
   * @param data - Données à convertir
   * @returns Chaîne hexadécimale formatée (ex: "01 03 00 00 00 01 84 0A")
   */
  public static bufferToHex(data: Buffer): string {
    return (
      data
        .toString('hex')
        .toUpperCase()
        .match(/.{1,2}/g)
        ?.join(' ') || 'N/A'
    );
  }

  /**
   * Convertit les codes d'exception Modbus en texte lisible
   * @param exceptionCode - Code d'exception Modbus
   * @returns Description de l'exception
   */
  public static getExceptionText(exceptionCode: number): string {
    const exceptions: { [key: number]: string } = {
      0x01: 'Fonction illégale',
      0x02: 'Adresse de données illégale',
      0x03: 'Valeur de données illégale',
      0x04: "Défaillance de l'appareil esclave",
      0x05: 'Accusé de réception',
      0x06: 'Appareil esclave occupé',
      0x08: 'Erreur de parité mémoire',
      0x0a: 'Passerelle de chemin indisponible',
      0x0b: 'Appareil cible non réactif',
    };
    return exceptions[exceptionCode] || `Exception inconnue (0x${exceptionCode.toString(16)})`;
  }

  /**
   * Valide les paramètres d'une requête Modbus
   * @param slaveId - ID de l'esclave (1-247)
   * @param functionCode - Code de fonction
   * @param startAddr - Adresse de début (0-65535)
   * @param quantity - Nombre de registres (1-125 pour lecture)
   * @returns true si valide, false sinon
   */
  public static validateParameters(
    slaveId: number,
    functionCode: number,
    startAddr: number,
    quantity: number,
  ): boolean {
    if (slaveId < 1 || slaveId > 247) return false;
    if (![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0f, 0x10].includes(functionCode)) return false;
    if (startAddr < 0 || startAddr > 65535) return false;
    if (quantity < 1 || quantity > 125) return false;
    return true;
  }
}

/**
 * Interface pour les réponses Modbus parsées
 */
export interface ModbusResponse {
  slaveId?: number;
  functionCode?: number;
  dataLength?: number;
  data?: Buffer;
  error?: string;
}

/**
 * Interface pour les options de configuration Modbus
 */
export interface ModbusOptions {
  slaveId?: number;
  responseTimeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * Énumération des codes de fonction Modbus courants
 */
export enum ModbusFunctionCode {
  READ_COILS = 0x01,
  READ_DISCRETE_INPUTS = 0x02,
  READ_HOLDING_REGISTERS = 0x03,
  READ_INPUT_REGISTERS = 0x04,
  WRITE_SINGLE_COIL = 0x05,
  WRITE_SINGLE_REGISTER = 0x06,
  WRITE_MULTIPLE_COILS = 0x0f,
  WRITE_MULTIPLE_REGISTERS = 0x10,
}
