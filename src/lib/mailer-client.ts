interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

interface SendEmailPayload {
  smtp: SmtpSettings;
  recipients: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  subject: string;
  body: string;
  attachmentUrls?: string[];
}

interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
  const serviceUrl = process.env.MAILER_SERVICE_URL;
  const serviceToken = process.env.MAILER_SERVICE_TOKEN;

  if (!serviceUrl || !serviceToken) {
    throw new Error("Mailer service configuration missing");
  }

  try {
    const response = await fetch(`${serviceUrl}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SERVICE-TOKEN": serviceToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Service error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkMailerHealth(): Promise<boolean> {
  const serviceUrl = process.env.MAILER_SERVICE_URL;
  if (!serviceUrl) return false;

  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
