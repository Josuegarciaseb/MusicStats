import Dashboard from "@/components/dashboard";

interface HomePageProps {
  searchParams?: {
    spotify?: string;
    message?: string;
  };
}

export default function HomePage({ searchParams }: HomePageProps) {
  const statusParam = searchParams?.spotify;
  const message = searchParams?.message;

  let initialMessage = "";

  if (statusParam === "connected") {
    initialMessage = "Spotify connected successfully.";
  }

  if (statusParam === "error" && message) {
    initialMessage = `Spotify authorization failed: ${message}`;
  }

  return <Dashboard initialMessage={initialMessage} />;
}
