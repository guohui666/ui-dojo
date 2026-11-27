import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { UIMessage } from "ai";
import { useEffect } from "react";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { Thread } from "@/components/assistant-ui/thread";
import { useAgent } from "@/hooks/use-agent";
import { useMemory } from "@/hooks/use-memory";
import { useThreads } from "@/hooks/use-threads";
import { useAgentMessages } from "@/hooks/use-agent-messages";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Button } from "@/components/ui/button";
import { PlusIcon, X } from "lucide-react";
import type { MastraClient } from "@mastra/client-js";
import { ThreadListSkeleton } from "@/components/assistant-ui/thread-list";
import { useDeleteThread } from "@/hooks/use-delete-thread";
import { newThreadLink } from "@/lib/utils";
import { MASTRA_BASE_URL } from "@/constants";

/**
 * A memory thread as the browser receives it over HTTP (dates are ISO strings).
 * Do not use `StorageThreadType` from `@mastra/core/memory` here. That is the
 * server storage type, where the dates are `Date` objects.
 */
type MemoryThread = Awaited<
  ReturnType<MastraClient["listMemoryThreads"]>
>["threads"][number];

const suggestions = [
  {
    title: "What's the latest movie?",
    action: "What's the latest movie?",
  },
  {
    title: "What's the first Ghibli movie?",
    action: "What's the first Ghibli movie?",
  },
  {
    title: "How many Ghibli movies are there?",
    action: "How many Ghibli movies are there?",
  },
  {
    title: "What's the longest Ghibli movie?",
    action: "What's the longest Ghibli movie?",
  },
];

const threadDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const getThreadDisplayTitle = (thread: MemoryThread) => {
  const title = thread.title?.trim();
  if (title) {
    return title;
  }

  const threadDate = new Date(thread.updatedAt ?? thread.createdAt);

  if (Number.isNaN(threadDate.getTime())) {
    return "Untitled Thread";
  }

  return threadDateFormatter.format(threadDate).replace(", ", " at ");
};

const AssistantUIDemo = () => {
  const { agentId, threadId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNewThread = searchParams.get("new") === "true";

  const { data: agent, isLoading: isAgentLoading } = useAgent(agentId!);
  const { data: memory } = useMemory(agentId!);
  const {
    data: threads,
    isLoading: isThreadsLoading,
    refetch: refreshThreads,
  } = useThreads({
    resourceId: agentId!,
    agentId: agentId!,
    isMemoryEnabled: !!memory?.result,
  });
  const { mutateAsync } = useDeleteThread();

  useEffect(() => {
    if (memory?.result && !threadId) {
      navigate(newThreadLink("assistant-ui", agentId!));
    }
  }, [memory?.result, threadId, navigate, agentId]);

  const handleDelete = async (deleteId: string) => {
    await mutateAsync({ threadId: deleteId!, agentId: agentId! });
    if (deleteId === threadId) {
      navigate(newThreadLink("assistant-ui", agentId!));
    }
  };

  if (isAgentLoading) {
    return null;
  }

  const handleRefreshThreadList = () => {
    searchParams.delete("new");
    setSearchParams(searchParams);
    refreshThreads();
  };

  return (
    <div className="grid grid-cols-[130px_1fr] md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr] gap-x-2 size-full">
      <Sidebar
        threads={threads || []}
        resourceId={agentId!}
        isLoading={isThreadsLoading}
        threadId={threadId!}
        agentId={agentId!}
        onDelete={handleDelete}
      />
      <Chat
        agentId={agentId!}
        agentName={agent?.name}
        threadId={threadId}
        memory={memory?.result}
        refreshThreadList={handleRefreshThreadList}
        isNewThread={isNewThread}
      />
    </div>
  );
};

export default AssistantUIDemo;

interface ChatProps {
  agentId: string;
  agentName?: string;
  threadId?: string;
  initialMessages?: UIMessage[];
  memory?: boolean;
  refreshThreadList?: () => void;
}

const Chat = ({
  agentId,
  threadId,
  memory,
  agentName,
  refreshThreadList,
  isNewThread,
}: Omit<ChatProps, "initialMessages"> & { isNewThread?: boolean }) => {
  const { data, isLoading: isMessagesLoading } = useAgentMessages({
    agentId: agentId,
    threadId: isNewThread ? undefined : threadId!,
    memory: memory ?? false,
  });

  if (isMessagesLoading) {
    return null;
  }

  return (
    <CustomRuntimeProvider
      key={threadId}
      initialMessages={
        data?.messages ? toAISdkV5Messages(data.messages) : undefined
      }
      agentId={agentId}
      threadId={threadId}
      refreshThreadList={refreshThreadList}
    >
      <Thread
        suggestions={suggestions}
        agentName={agentName}
        welcome="Ask me about Ghibli movies, characters, and trivia."
      />
    </CustomRuntimeProvider>
  );
};

const CustomRuntimeProvider = ({
  children,
  agentId,
  initialMessages,
  threadId,
  refreshThreadList,
}: { children: React.ReactNode } & Omit<ChatProps, "memory" | "agentName">) => {
  // @mastra/react >= 0.5.0 no longer exports `useChat` with AI SDK UI messages,
  // `toAssistantUIMessage` or `MastraUIMessage` (its `useChat` now returns
  // MastraDBMessage[]). The chat therefore streams through `chatRoute()` (see
  // src/mastra/index.ts) with Assistant UI's own AI SDK runtime, the same way as
  // the client-tools and human-in-the-loop pages. The thread list, the stored
  // history and the delete action still use the Mastra client (hooks/use-*.ts).
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${MASTRA_BASE_URL}/chat/${agentId}`,
      // Same default as the old `useChat`: the resource falls back to the agent id.
      body: threadId
        ? { memory: { resource: agentId, thread: threadId } }
        : undefined,
    }),
    messages: initialMessages,
    onFinish: () => {
      void refreshThreadList?.();
    },
    onError: (error) => {
      console.error("Error occurred in CustomRuntimeProvider", error);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
};

interface SidebarProps {
  threads: MemoryThread[];
  agentId: string;
  isLoading: boolean;
  threadId: string;
  resourceId: string;
  onDelete: (threadId: string) => void;
}

const Sidebar = ({
  agentId,
  threadId,
  threads,
  isLoading,
  onDelete,
}: SidebarProps) => {
  if (isLoading) {
    return <ThreadListSkeleton />;
  }

  return (
    <ol className="aui-root aui-thread-list-root flex flex-col items-stretch gap-1.5">
      <li>
        <Button
          className="aui-thread-list-new flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start hover:bg-muted data-active:bg-muted"
          variant="outline"
          asChild
        >
          <Link to={newThreadLink("assistant-ui", agentId)}>
            <PlusIcon />
            New Thread
          </Link>
        </Button>
      </li>

      {threads.map((thread) => {
        const isActive = thread.id === threadId;

        const threadLink = `/assistant-ui/${agentId}/chat/${thread.id}`;

        return (
          <li key={thread.id} className="flex items-center gap-2 w-full">
            <Button
              className="aui-thread-list-new rounded-lg px-2.5 py-2 justify-start hover:bg-muted data-active:bg-muted flex-1 min-w-0"
              variant="ghost"
              asChild
              data-active={isActive ? true : undefined}
            >
              <Link
                className="flex items-center min-w-0 w-full"
                to={threadLink}
              >
                <span className="truncate">{getThreadDisplayTitle(thread)}</span>
              </Link>
            </Button>
            <Button
              onClick={() => onDelete(thread.id)}
              variant="outline"
              size="icon-sm"
              className="shrink-0"
            >
              <X aria-label="Delete Thread" />
            </Button>
          </li>
        );
      })}
    </ol>
  );
};
