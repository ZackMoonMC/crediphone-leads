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

Respondé SIEMPRE en este formato JSON exacto sin markdown:
{
  "estado": "CALIFICADO" | "REVISAR" | "NO_CALIFICADO",
  "emoji": "✅" | "⚠️" | "❌",
  "razon": "explicación breve en español de máximo 2 oraciones",
  "recomendacion": "acción sugerida para el asesor en 1 oración"
}`;

app.post('/api/lead', async (req, res) => {
  try {
    const { cedula, fechaNacimiento, telefono, trabajo, antiguedad, salario } = req.body;

    if (!cedula || !telefono || !trabajo || !antiguedad || !salario) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Calcular edad
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
      analisis = JSON.parse(response.content[0].text);
    } catch {
      analisis = {
        estado: 'REVISAR',
        emoji: '⚠️',
        razon: 'No se pudo analizar automáticamente.',
        recomendacion: 'Revisar manualmente.'
      };
    }

    // Armar mensaje WhatsApp
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

    // Enviar WhatsApp solo si calificado o revisar
    if (analisis.estado !== 'NO_CALIFICADO') {
      await twilioClient.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:${process.env.MI_NUMERO}`,
        body: mensajeWA
      });
    } else {
      // Igual notificar pero con indicación de no calificado
      await twilioClient.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:${process.env.MI_NUMERO}`,
        body: mensajeWA
      });
    }

    res.json({ success: true, analisis });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', servicio: 'Crediphone Leads' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Crediphone Leads corriendo en puerto ${PORT}`));
