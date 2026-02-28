import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold font-headline">Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            This is a placeholder for your {`application's`} terms of service. You should replace this
            text with your own terms, outlining the rules and guidelines for using your app.
          </p>
          <p>
            By using EVonGo {`("the app")`}, you agree to these terms. The services provided,
            including route planning, station location, and AI-powered diagnostics, are for
            informational purposes only. While we strive for accuracy, we cannot guarantee the
            correctness or availability of the data provided.
          </p>
          <p>
            You are responsible for your own actions and decisions while driving and using our
            application. Always prioritize safety and follow traffic laws.
          </p>
          <p>
            We reserve the right to terminate or suspend access to our service at our discretion,
            without notice, for conduct that we believe violates these terms or is harmful to
            other users of the app, us, or third parties.
          </p>
          <Link href="/login" className="text-primary hover:underline mt-4 inline-block">
            &larr; Back to Login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
