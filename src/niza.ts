/**
 * NIZA (Nice) Classification — shared constants and inference logic.
 * Used by both INPI (Argentina) and WIPO (worldwide) checkers.
 */

export const CLASE_DESCRIPTIONS: Record<number, string> = {
  1: "Quimicos",
  2: "Pinturas",
  3: "Cosmeticos",
  4: "Aceites industriales",
  5: "Farmaceuticos",
  6: "Metales",
  7: "Maquinaria",
  8: "Herramientas manuales",
  9: "Tecnologia/Electronica",
  10: "Aparatos medicos",
  11: "Iluminacion/Climatizacion",
  12: "Vehiculos",
  13: "Armas de fuego",
  14: "Joyeria/Relojeria",
  15: "Instrumentos musicales",
  16: "Papel/Imprenta",
  17: "Caucho/Plasticos",
  18: "Cuero/Marroquineria",
  19: "Materiales construccion",
  20: "Muebles",
  21: "Utensilios hogar",
  22: "Cuerdas/Textiles",
  23: "Hilos",
  24: "Tejidos",
  25: "Ropa/Calzado",
  26: "Merceria",
  27: "Alfombras",
  28: "Juegos/Deportes",
  29: "Alimentos (carnes, lacteos)",
  30: "Alimentos (cafe, te, cereales)",
  31: "Productos agricolas",
  32: "Bebidas sin alcohol",
  33: "Bebidas alcoholicas",
  34: "Tabaco",
  35: "Publicidad/Negocios",
  36: "Seguros/Finanzas",
  37: "Construccion/Reparacion",
  38: "Telecomunicaciones",
  39: "Transporte",
  40: "Tratamiento materiales",
  41: "Educacion/Entretenimiento",
  42: "Tecnologia/Ciencia",
  43: "Restaurantes/Alojamiento",
  44: "Medicina/Veterinaria",
  45: "Servicios juridicos",
};

// ── Keyword → NIZA class mapping ──────────────────────────────────────
// Each entry: [keywords[], relevantClasses[]]
// Keywords are matched against the normalized description (lowercase, no accents).
const KEYWORD_CLASS_RULES: [string[], number[]][] = [
  // ── Bebidas alcoholicas / Vinos ──
  [["vino", "vinos", "bodega", "vinoteca", "enologia", "sommelier", "wine", "winery", "viñedo", "vinedo", "cava", "champagne", "espumante"], [33]],
  [["cerveza", "cerveceria", "brewery", "beer", "birra"], [32, 33]],
  [["licor", "destilado", "destileria", "whisky", "whiskey", "gin", "vodka", "ron", "tequila", "mezcal", "fernet", "spirits", "aperitivo", "vermouth", "vermut"], [33]],
  [["bebida", "drink", "jugo", "juice", "agua mineral", "gaseosa", "soda", "energizante"], [32]],

  // ── Alimentos ──
  [["carne", "embutido", "fiambre", "lacteo", "queso", "leche", "huevo", "manteca", "yogur", "aceite oliva", "conserva", "mermelada", "fruto seco"], [29]],
  [["cafe", "chocolate", "te", "cereal", "pasta", "pan", "panaderia", "confiteria", "helado", "dulce", "galletita", "arroz", "condimento", "salsa", "miel", "harina", "snack", "golosina", "reposteria", "pasteleria"], [30]],
  [["comida", "alimento", "food", "gourmet"], [29, 30]],
  [["agricola", "agro", "fruta", "verdura", "semilla", "planta", "vivero", "flor", "floreria"], [31]],
  [["tabaco", "cigarro", "cigarrillo", "puro", "habano", "vape", "vapeo"], [34]],

  // ── Gastronomia / Hospitalidad ──
  [["restaurante", "resto", "bar", "pub", "gastronomia", "gastro", "catering", "chef", "cocina"], [43]],
  [["hotel", "hostel", "alojamiento", "hospedaje", "posada", "cabana", "resort", "turismo", "viaje"], [43, 39]],
  [["club", "premium", "exclusivo", "membresia", "suscripcion"], [35, 41, 43]],

  // ── Tecnologia / Digital ──
  [["app", "aplicacion", "software", "plataforma", "digital", "saas", "startup"], [9, 42]],
  [["web", "sitio", "internet", "online", "ecommerce", "marketplace", "tienda online"], [9, 35, 42]],
  [["tecnologia", "tech", "ai", "inteligencia artificial", "datos", "data", "nube", "cloud", "blockchain", "crypto", "cripto"], [9, 42]],
  [["videojuego", "gaming", "gamer", "esport"], [9, 28, 41]],

  // ── Moda / Indumentaria ──
  [["ropa", "moda", "fashion", "indumentaria", "vestimenta", "prenda", "remera", "camisa", "pantalon", "vestido", "jean"], [25]],
  [["calzado", "zapato", "zapatilla", "bota", "sandalia", "sneaker"], [25]],
  [["sombrero", "gorro", "gorra", "accesorio"], [25, 26]],
  [["textil", "tela", "tejido", "lana", "algodon", "seda"], [24, 25]],
  [["joya", "joyeria", "reloj", "relojeria", "bijouterie", "anillo", "collar", "pulsera"], [14]],
  [["cartera", "bolso", "cuero", "marroquineria", "valija", "mochila", "equipaje"], [18]],

  // ── Belleza / Salud ──
  [["cosmetica", "belleza", "beauty", "maquillaje", "perfume", "fragancia", "skincare", "cuidado personal", "crema", "shampoo", "jabon"], [3]],
  [["farmacia", "farmaceutico", "medicina", "salud", "health", "suplemento", "vitamina", "nutricion", "bienestar", "wellness"], [5, 44]],
  [["clinica", "hospital", "consultorio", "medico", "doctor", "odontologo", "dentista", "veterinaria", "veterinario"], [44]],

  // ── Negocios / Servicios ──
  [["consultora", "consulting", "asesoria", "marketing", "publicidad", "agencia", "negocio", "comercio", "retail", "importacion", "exportacion", "distribucion", "franquicia"], [35]],
  [["finanza", "banco", "inversion", "seguro", "fintech", "contabilidad", "contable", "credito", "prestamo", "bolsa"], [36]],
  [["educacion", "academia", "curso", "capacitacion", "training", "escuela", "universidad", "colegio", "coaching", "enseñanza", "formacion"], [41]],
  [["legal", "abogado", "juridico", "notaria", "estudio juridico"], [45]],
  [["entretenimiento", "espectaculo", "evento", "show", "festival", "cine", "pelicula", "serie", "produccion audiovisual", "editorial", "libro", "revista"], [41]],
  [["musica", "audio", "podcast", "radio", "discografica", "sello", "estudio grabacion"], [9, 41]],
  [["arte", "galeria", "artista", "ilustracion"], [41, 42]],

  // ── Construccion / Industria ──
  [["construccion", "constructora", "arquitectura", "inmobiliaria", "real estate", "obra", "reforma"], [37, 19]],
  [["transporte", "logistica", "delivery", "envio", "mudanza", "flete", "correo", "encomienda", "courier"], [39]],
  [["telecomunicacion", "telecom", "comunicacion", "telefonia"], [38]],

  // ── Hogar / Muebles ──
  [["mueble", "decoracion", "hogar", "deco", "interiorismo", "amoblar", "colchon"], [20, 21]],
  [["alfombra", "cortina", "tapiz"], [27]],
  [["electrodomestico", "cocina electrica", "heladera", "aire acondicionado", "calefaccion", "iluminacion", "lampara"], [11]],

  // ── Vehiculos / Deporte ──
  [["auto", "vehiculo", "moto", "automotriz", "concesionaria", "repuesto", "neumatico"], [12]],
  [["deporte", "sport", "fitness", "gym", "gimnasio", "yoga", "pilates", "entrenamiento", "running", "crossfit"], [28, 41]],

  // ── Diseño / Ciencia ──
  [["diseno", "design", "creativo", "estudio de diseno", "ux", "ui", "branding"], [42]],
  [["laboratorio", "investigacion", "ciencia", "quimica", "biotecnologia"], [1, 42]],
  [["pintura", "revestimiento", "barniz", "esmalte"], [2]],
];

/**
 * Infer relevant NIZA classes from a brand description.
 * Returns empty array if no classes could be inferred (= check all).
 */
export function inferRelevantClasses(description: string): number[] {
  if (!description) return [];

  const normalized = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, " ");

  const matched = new Set<number>();

  for (const [keywords, classes] of KEYWORD_CLASS_RULES) {
    for (const kw of keywords) {
      const normalizedKw = kw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (normalized.includes(normalizedKw)) {
        for (const c of classes) matched.add(c);
      }
    }
  }

  return [...matched].sort((a, b) => a - b);
}
