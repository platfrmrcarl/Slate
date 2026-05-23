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

export interface EmailVerificationEmailProps {
  verifyUrl: string;
  displayName: string;
}

export function EmailVerificationEmail({ verifyUrl, displayName }: EmailVerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f9fafb", padding: "20px" }}>
        <Container
          style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "560px" }}
        >
          <Heading style={{ fontSize: "20px", margin: 0 }}>Welcome, {displayName}!</Heading>
          <Text>Confirm your email address to finish setting up your account.</Text>
          <Button
            href={verifyUrl}
            style={{
              background: "#0b5fff",
              color: "white",
              padding: "10px 18px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Verify email
          </Button>
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>{verifyUrl}</Text>
        </Container>
      </Body>
    </Html>
  );
}
