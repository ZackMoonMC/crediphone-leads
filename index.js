require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos un analista de créditos para Crediphone Express, una empresa financiera de Paraguay que otorga préstamos personales.
Tu tarea es analizar los datos de un solicitante y determinar si es un cliente CALIFICADO o NO CALIFICADO para un préstamo.
CRITERIOS DE CALIFICACIÓN:
✅ CALIFICADO si cumple TODOS estos requisitos:
- Trabaja como: Asalariado con IPS, Funcionario público, Funcionario bancario, o Jubilado
- Antigüedad laboral: 6 meses a 1 año O más de 1 año
- Salario mensual: Gs. 2.500.000 o más
⚠️ REVISAR (calificado con observación) si:
- Cumple con empleo y salario pero tiene menos de 6 meses de antigüedad
❌ NO CALIFICADO si:
- Salario menor a Gs. 2.500.000
IMPORTANTE: Nunca resumas, abrevies ni modifiques los datos del formulario. Envía SIEMPRE todos los campos exactamente como llegaron, sin omitir ninguno.
Respondé SIEMPRE en este formato JSON exacto sin markdown:
{
  "estado": "CALIFICADO" | "REVISAR" | "NO_CALIFICADO",
  "emoji": "✅" | "⚠️" | "❌",
  "razon": "explicación breve en español de máximo 2 oraciones",
  "recomendacion": "acción sugerida para el asesor en 1 oración"
}`;

// ─── ENDPOINT ORIGINAL (panel de legajos) ───────────────────────────────────
app.post('/api/lead', async (req, res) => {
  try {
    const { cedula, fechaNacimiento, telefono, trabajo, antiguedad, salario } = req.body;

    if (!cedula || !telefono || !trabajo || !antiguedad || !salario) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    const edad = hoy.getFullYear() - nacimiento.getFullYear();

    const mensajeParaClaude = `
Analiza este solicitante de préstamo:
- Cédula: ${cedula}
- Edad: ${edad} años
- Teléfono: ${telefono}
- Trabajo: ${trabajo}
- Antigüedad: ${antiguedad}
- Salario mensual: ${salario}
    `;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: mensajeParaClaude }]
    });

    let analisis;
    try {
      const rawText = response.content[0].text;
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      analisis = JSON.parse(cleaned);
    } catch {
      analisis = {
        estado: 'REVISAR',
        emoji: '⚠️',
        razon: 'No se pudo analizar automáticamente.',
        recomendacion: 'Revisar manualmente.'
      };
    }

    const mensajeWA = `${analisis.emoji} *NUEVO LEAD - CREDIPHONE EXPRESS*
*Estado:* ${analisis.estado}
━━━━━━━━━━━━━━━━━
📋 *Datos del solicitante:*
• Cédula: ${cedula}
• Edad: ${edad} años
• Teléfono: ${telefono}
• Trabajo: ${trabajo}
• Antigüedad: ${antiguedad}
• Salario: ${salario}
━━━━━━━━━━━━━━━━━
🤖 *Análisis IA:*
${analisis.razon}
💡 *Recomendación:* ${analisis.recomendacion}`;

    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${process.env.MI_NUMERO}`,
      body: mensajeWA
    });

    res.json({ success: true, analisis });
  } catch (error) {
    console.error('Error /api/lead:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── ENDPOINT NUEVO (formulario iPhone) ─────────────────────────────────────
app.post('/nuevo-lead', async (req, res) => {
  try {
    const {
      modelo, capacidad, cuotas,
      antiguedad, trabajo, ingreso,
      nombre, cedula, nacimiento, telefono
    } = req.body;

    if (!modelo || !nombre || !cedula || !telefono) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Análisis IA del solicitante
    const mensajeParaClaude = `
Analiza este solicitante de financiamiento de iPhone:
- Nombre: ${nombre}
- Cédula: ${cedula}
- Fecha de nacimiento: ${nacimiento}
- Teléfono: ${telefono}
- Trabajo: ${trabajo}
- Antigüedad: ${antiguedad}
- Ingreso mensual: ${ingreso}
- iPhone solicitado: ${modelo} ${capacidad} en ${cuotas}
    `;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: mensajeParaClaude }]
    });

    let analisis;
    try {
      const rawText = response.content[0].text;
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      analisis = JSON.parse(cleaned);
    } catch {
      analisis = {
        estado: 'REVISAR',
        emoji: '⚠️',
        razon: 'No se pudo analizar automáticamente.',
        recomendacion: 'Revisar manualmente con Joshua.'
      };
    }

    // Mensaje WhatsApp para Joshua
    const mensajeWA = `${analisis.emoji} *NUEVO LEAD IPHONE - CREDIPHONE*
*Estado:* ${analisis.estado}
━━━━━━━━━━━━━━━━━
📱 *iPhone solicitado:*
• Modelo: ${modelo} ${capacidad}
• Cuotas: ${cuotas}
━━━━━━━━━━━━━━━━━
👤 *Datos del cliente:*
• Nombre: ${nombre}
• Cédula: ${cedula}
• Fecha de nacimiento: ${nacimiento}
• WhatsApp: ${telefono}
• Trabajo: ${trabajo}
• Antigüedad: ${antiguedad}
• Ingreso: ${ingreso}
━━━━━━━━━━━━━━━━━
🤖 *Análisis IA:*
${analisis.razon}
💡 *Recomendación:* ${analisis.recomendacion}`;

    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${process.env.MI_NUMERO}`,
      body: mensajeWA
    });

    res.json({ success: true, analisis });
  } catch (error) {
    console.error('Error /nuevo-lead:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', servicio: 'Crediphone Leads' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Crediphone Leads corriendo en puerto ${PORT}`));
