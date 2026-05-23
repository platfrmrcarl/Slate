import manifest from "./manifest.json";
import { Layout } from "./components/Layout";
import { Heading } from "./components/Heading";
import { Paragraph } from "./components/Paragraph";
import { Button } from "./components/Button";
import { Hero } from "./components/Hero";
import { Image } from "./components/Image";
import PageTemplate from "./templates/page";
import PostTemplate from "./templates/post";
import ArchiveTemplate from "./templates/archive";
import HomeTemplate from "./templates/home";
import type { ThemeManifest } from "@/themes/manifest";

export const themeManifest = manifest as unknown as ThemeManifest;

export default {
  manifest: themeManifest,
  Layout,
  primitives: { Heading, Paragraph, Button, Hero, Image },
  templates: {
    page: PageTemplate,
    post: PostTemplate,
    archive: ArchiveTemplate,
    home: HomeTemplate,
  },
};
