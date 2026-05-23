import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface PasswordResetEmailProps {
  resetUrl: string;
  displayName: string;
}

export function PasswordResetEmail({ resetUrl, displayName }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your WordPressKiller password</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f9fafb", padding: "20px" }}>
        <Container
          style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "560px" }}
        >
          <Heading style={{ fontSize: "20px", margin: 0 }}>Hi {displayName},</Heading>
          <Text>
            We received a request to reset the password on your WordPressKiller account. Click the
            button below to choose a new one. The link expires in 24 hours.
          </Text>
          <Button
            href={resetUrl}
            style={{
              background: "#0b5fff",
              color: "white",
              padding: "10px 18px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Reset password
          </Button>
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>
            If you didn&apos;t request this, you can safely ignore the email — your password
            won&apos;t change.
          </Text>
          <Text style={{ color: "#6b7280", fontSize: "12px" }}>{resetUrl}</Text>
        </Container>
      </Body>
    </Html>
  );
}
