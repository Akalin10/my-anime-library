import { AnimeLibraryHome } from "@/components/anime/AnimeLibraryHome";
import { QueryProvider } from "@/components/common/QueryProvider";

export default function HomePage() {
  return (
    <QueryProvider>
      <AnimeLibraryHome />
    </QueryProvider>
  );
}
