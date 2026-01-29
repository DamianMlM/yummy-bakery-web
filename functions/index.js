const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

/** 
 * CONFIGURACION SMTP 
 * Se usan variables de entorno desde el archivo .env en la carpeta functions/
 * Credenciales actualizadas: 2026-01-29
 */
const gmailEmail = process.env.SMTP_USER || "";
const gmailPassword = process.env.SMTP_PASS || "";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: gmailEmail,
        pass: gmailPassword,
    },
});

const APP_NAME = "YUMMY BAKERY";
const BRAND_HEADER = `
<div style="background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('https://i.pinimg.com/originals/0e/38/4a/0e384af5d3bc72a50e046b7343f8fe9f.gif'); background-size: cover; background-position: center; padding: 60px 20px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0; letter-spacing: 4px; text-transform: uppercase;">${APP_NAME}</h1>
    <p style="color: #f3f0eb; font-family: 'Poppins', sans-serif; font-size: 14px; margin-top: 10px;">Repostería Artesanal & Momentos Dulces</p>
</div>
`;

// 📨 FUNCIÓN 1: CONFIRMACIÓN DE PEDIDO (onCreate)
exports.confirmacionPedido = functions.firestore
    .document("pedidos/{pedidoId}")
    .onCreate(async (snap, context) => {
        const pedido = snap.data();
        const id = snap.id;
        const email = pedido.cliente.email;

        if (!email) {
            console.log("No hay email para el pedido:", id);
            return null;
        }

        // 1. Generar Tabla de Productos
        let itemsHtml = "";
        pedido.items.forEach((item) => {
            itemsHtml += `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #f2e7d5; color: #4A3728; font-size: 14px;">
                    <strong>${item.cantidad}x ${item.nombre}</strong><br>
                    <span style="font-size: 11px; color: #9c6644;">${item.extrasTexto || ""}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #f2e7d5; text-align: right; color: #4A3728; font-weight: bold;">
                    $${item.subtotal}
                </td>
            </tr>`;
        });

        // 2. Lógica Condicional de Pago
        let bloquePago = "";
        if (pedido.pago === "transferencia") {
            bloquePago = `
            <div style="margin-top:40px; background-color:#Fdfbff; border:2px solid #820AD1; border-radius:12px; padding:25px; text-align:center;">
               <h3 style="color:#820AD1; margin:0 0 15px; font-size:18px;">💳 Datos para Transferencia</h3>
               <p style="color:#000; font-weight:bold; font-size:16px;">Banco: NU (STP)</p>
               <p style="background:#f0e6f7; display:inline-block; padding:5px 10px; border-radius:6px; font-weight:bold; font-size:18px;">CLABE: 638180000189543165</p>
               <p>Beneficiaria: Leticia Mariscal Miranda</p>
               <p style="background:#820AD1; color:white; padding:10px; border-radius:8px;">⚠️ Concepto: ${pedido.folio || id.substr(0, 5)}</p>
               <p style="font-size: 11px; color: #6b7280; margin-top: 10px;">Por favor, envía tu comprobante por WhatsApp.</p>
            </div>`;
        } else {
            bloquePago = `
            <div style="margin-top:30px; padding:20px; background-color:#F0FDF4; border:1px solid #BBF7D0; border-radius:12px; text-align:center;">
               <h3 style="color:#166534;">💵 Pago Contra Entrega</h3>
               <p style="color:#15803D;">El pago se realizará en efectivo al recibir tu pedido.</p>
            </div>`;
        }

        // 3. Dirección de Entrega
        const infoEntrega = pedido.metodo === "envio"
            ? `<p><strong>Dirección:</strong> ${pedido.cliente.direccion}</p>`
            : `<div style="color: #9c6644; font-weight: bold; background: #faf8f5; padding: 10px; border-radius: 8px; border: 1px dashed #d4a373;">
                <p style="margin: 0;">📍 Punto de Entrega: <strong>Arroyo Salvial 433</strong></p>
                <p style="margin: 5px 0 0;">⏰ Horario: <strong>6:00 PM - 10:30 PM</strong></p>
               </div>`;

        const mailOptions = {
            from: `"${APP_NAME}" <${gmailEmail}>`,
            to: email,
            subject: `🥐 ¡Pedido Recibido! #${pedido.folio || id.substr(0, 5)} - ${APP_NAME}`,
            html: `
            <div style="background-color: #fdfbf7; padding: 20px; font-family: 'Poppins', sans-serif;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                    ${BRAND_HEADER}
                    
                    <div style="padding: 30px;">
                        <h2 style="color: #4A3728; margin-top: 0;">¡Hola ${pedido.cliente.nombre}!</h2>
                        <p style="color: #6b7280; line-height: 1.6;">Gracias por elegir <strong>Yummy Bakery</strong>. Hemos recibido tu pedido y ya estamos preparando todo para que esté delicioso.</p>
                        
                        <div style="margin: 30px 0; background: #faf8f5; border-radius: 12px; padding: 20px;">
                            <h4 style="margin: 0 0 15px; color: #4A3728; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Resumen del Pedido</h4>
                            <table style="width: 100%; border-collapse: collapse;">
                                ${itemsHtml}
                                <tr>
                                    <td style="padding: 12px; font-size: 16px; font-weight: bold; color: #4A3728;">Total</td>
                                    <td style="padding: 12px; font-size: 18px; font-weight: bold; color: #4A3728; text-align: right;">$${pedido.total}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="border-left: 4px solid #f2e7d5; padding-left: 15px; margin: 20px 0; font-size: 14px; color: #4A3728;">
                            <p><strong>Método:</strong> ${pedido.metodo === "envio" ? "Envío a domicilio" : "Recoger"}</p>
                            ${infoEntrega}
                        </div>

                        ${bloquePago}

                        <div style="margin-top: 40px; text-align: center; border-top: 1px solid #f2e7d5; pt: 20px;">
                            <p style="color: #9ca3af; font-size: 12px;">Si tienes dudas, contáctanos por WhatsApp al 33 2253 4583</p>
                        </div>
                    </div>
                </div>
            </div>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("Email de confirmación enviado a:", email);
        } catch (error) {
            console.error("Error enviando email:", error);
        }
        return null;
    });

// 🎉 FUNCIÓN 2: AGRADECIMIENTO (onUpdate)
exports.agradecimientoPedido = functions.firestore
    .document("pedidos/{pedidoId}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const before = change.before.data();
        const id = change.after.id;

        // Solo disparar si cambia a Finalizado y antes no lo era
        if (after.estatus === "Finalizado" && before.estatus !== "Finalizado") {
            const email = after.cliente.email;
            if (!email) return null;

            const mailOptions = {
                from: `"${APP_NAME}" <${gmailEmail}>`,
                to: email,
                subject: `✨ ¡Esperamos que lo disfrutes! - ${APP_NAME}`,
                html: `
                <div style="background-color: #fdfbf7; padding: 20px; font-family: 'Poppins', sans-serif;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                        ${BRAND_HEADER}
                        
                        <div style="padding: 40px; text-align: center;">
                            <h2 style="color: #4A3728; font-size: 24px;">¡Tu pedido ha sido entregado!</h2>
                            <p style="color: #6b7280; line-height: 1.6; font-size: 16px;">
                                Muchas gracias por tu compra, <strong>${after.cliente.nombre}</strong>. <br>
                                Esperamos que cada bocado de tu pedido sea especial.
                            </p>
                            
                            <div style="margin: 40px 0; padding: 30px; border: 1px dashed #f2e7d5; border-radius: 15px;">
                                <h3 style="color: #4A3728; margin-bottom: 15px;">¿Te gustó nuestro pan?</h3>
                                <p style="color: #9c6644; font-size: 14px; margin-bottom: 25px;">
                                    Tu opinión nos ayuda a seguir horneando con amor. <br>
                                    ¡Etiquétanos en Instagram para compartir tu momento Yummy!
                                </p>
                                <a href="https://www.instagram.com/yummy_bakery_lf/" style="background: #4A3728; color: white; padding: 12px 25px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                                    COMPARTIR MI RESEÑA
                                </a>
                            </div>

                            <p style="color: #4A3728; font-size: 18px; font-family: 'Playfair Display', serif;">¡Vuelve pronto!</p>
                            
                            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f2e7d5;">
                                <p style="color: #9ca3af; font-size: 11px;">Yummy Bakery LF - Repostería para el Alma</p>
                            </div>
                        </div>
                    </div>
                </div>
                `,
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log("Email de agradecimiento enviado a:", email);
            } catch (error) {
                console.error("Error enviando email agradecimiento:", error);
            }
        }
        return null;
    });
