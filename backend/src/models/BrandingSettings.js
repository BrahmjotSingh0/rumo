const database = require('../config/database');

const FIELDS = ['app_name', 'tagline', 'description', 'logo_icon', 'logo_full', 'primary_color', 'features', 'background_presets'];
const JSON_FIELDS = ['features', 'background_presets'];

class BrandingSettings {
  static async get() {
    const result = await database.query('SELECT * FROM "branding_settings" WHERE "id" = 1');
    return result.rows[0] || null;
  }

  static async upsert(fields) {
    const columns = Object.keys(fields).filter(
      (key) => FIELDS.includes(key) && fields[key] !== undefined
    );

    if (columns.length === 0) {
      return this.get();
    }

    const insertColumns = columns.map((col) => `"${col}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const setClause = columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');
    // jsonb columns need an actual JSON string, not the driver's default
    // (and wrong) String(value) coercion of an object/array parameter.
    const values = columns.map((col) => (JSON_FIELDS.includes(col) ? JSON.stringify(fields[col]) : fields[col]));

    const query = `
      INSERT INTO "branding_settings" ("id", ${insertColumns})
      VALUES (1, ${placeholders})
      ON CONFLICT ("id") DO UPDATE SET ${setClause}, "updated_at" = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await database.query(query, values);
    return result.rows[0];
  }
}

module.exports = BrandingSettings;
