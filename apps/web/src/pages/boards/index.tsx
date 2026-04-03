import { useRouter } from "next/router";
import { useEffect } from "react";
import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { api } from "~/utils/api";
import BoardsView from "~/views/boards";

const BoardsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const utils = api.useUtils();

  const acceptEmailInvite = api.member.acceptEmailInvite.useMutation({
    onSuccess: ({ workspacePublicId }) => {
      void utils.workspace.all.invalidate();
      void router.replace(`/boards?workspacePublicId=${workspacePublicId}`);
    },
  });

  useEffect(() => {
    if (
      router.isReady &&
      router.query.type === "invite" &&
      typeof router.query.memberPublicId === "string"
    ) {
      acceptEmailInvite.mutate({ memberPublicId: router.query.memberPublicId });
    }
  }, [router.isReady]);

  return (
    <>
      <BoardsView />
      <Popup />
    </>
  );
};

BoardsPage.getLayout = (page) => getDashboardLayout(page);

export default BoardsPage;
