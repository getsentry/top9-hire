import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DECISION } from "@/lib/pack";
import { loadShare, type SharePayload } from "@/lib/share";
import "../share.css";

type Props = { params: Promise<{ token: string }> };

/** One Blob read per request: generateMetadata and the page share it. */
const findShare = cache(loadShare);

const roleOf = (share: SharePayload) => (share.c ? `${share.j} at ${share.c}` : share.j);

const whoOf = (share: SharePayload) => (share.h ? `@${share.h}` : "This Top 9");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await findShare(token);
  if (!share) return {};
  const title = `${whoOf(share)} for ${roleOf(share)}: ${DECISION[share.m]}`;
  const description = `${share.a}${share.p === undefined ? "" : `, ${share.p}% aligned`}. Nine games instead of a LeetCode round.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "top9.wtf", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const share = await findShare(token);
  if (!share) notFound();

  return (
    <main className="share">
      <header className="share-brand">
        <Image src="/brand/top9-mascot.png" alt="" width={44} height={44} priority />
        <span>top9.wtf</span>
      </header>
      <p className="share-line">{`${whoOf(share)} for ${roleOf(share)}`}</p>
      <h1 className="share-decision">
        <span>{DECISION[share.m]}</span>
      </h1>
      <p className="share-archetype">
        {share.a}
        {share.p === undefined ? null : <span>{` · ${share.p}% aligned`}</span>}
      </p>
      <ol className="share-games">
        {share.g.map((title, i) => (
          <li key={i}>{title}</li>
        ))}
      </ol>
      <Link className="share-cta" href="/">
        Match your own Top 9
      </Link>
    </main>
  );
}
