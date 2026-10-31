"use client";

import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getAvatarImageUrl, type AuthUser, useAuth } from "@/app/auth-provider";
import type { UiTheme } from "@/lib/analysis-helpers";
import {
  type BoardThemeId,
  type PieceThemeId,
  BOARD_THEMES,
  PIECE_THEMES,
  AVATAR_PRESETS,
  createPieceSet,
} from "@/components/analysis/board-themes";

export function UserAvatar({
  className = "size-10",
  user,
}: {
  className?: string;
  user: AuthUser;
}) {
  const preset = AVATAR_PRESETS.find((item) => item.id === user.avatarPreset) ?? AVATAR_PRESETS[0];

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 shadow-md ${className} ${preset.className}`}
      aria-hidden="true"
    >
      {user.hasCustomAvatar ? (
        // The authenticated image is served by Spring Boot and requires credentials.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={user.avatarVersion}
          src={getAvatarImageUrl(user)}
          alt=""
          crossOrigin="use-credentials"
          className="size-full object-cover"
        />
      ) : preset.symbol ? (
        <span className="text-[1.65em] leading-none">{preset.symbol}</span>
      ) : (
        <UserRound className="size-[58%]" />
      )}
    </span>
  );
}

export function AppearanceSettings({
  boardThemeId,
  onBoardThemeChange,
  onPieceThemeChange,
  onUiThemeChange,
  pieceThemeId,
  uiTheme,
}: {
  boardThemeId: BoardThemeId;
  onBoardThemeChange: (theme: BoardThemeId) => void;
  onPieceThemeChange: (theme: PieceThemeId) => void;
  onUiThemeChange: (theme: UiTheme) => void;
  pieceThemeId: PieceThemeId;
  uiTheme: UiTheme;
}) {
  const {
    isLoading: isUserLoading,
    logout,
    updateAvatarPreset,
    uploadAvatar,
    user,
  } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState("");
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  async function chooseAvatarPreset(preset: string) {
    setAvatarFeedback("");
    setIsAvatarSaving(true);
    try {
      await updateAvatarPreset(preset);
      setAvatarFeedback("Đã cập nhật ảnh đại diện.");
    } catch (error) {
      setAvatarFeedback(error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện.");
    } finally {
      setIsAvatarSaving(false);
    }
  }

  async function chooseAvatarFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarFeedback("Ảnh đại diện không được lớn hơn 2 MB.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarFeedback("Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.");
      return;
    }

    setAvatarFeedback("");
    setIsAvatarSaving(true);
    try {
      await uploadAvatar(file);
      setAvatarFeedback("Đã tải ảnh đại diện lên.");
    } catch (error) {
      setAvatarFeedback(error instanceof Error ? error.message : "Không thể tải ảnh đại diện lên.");
    } finally {
      setIsAvatarSaving(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
    }
  }

  return (
    <Sheet
      open={isSettingsOpen}
      onOpenChange={(open) => {
        setIsSettingsOpen(open);
        if (!open) {
          setIsAppearanceOpen(false);
          setIsThemeOpen(false);
        }
      }}
    >
      <SheetTrigger asChild>
        {user ? (
          <button
            type="button"
            className="group relative grid size-11 place-items-center rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
            aria-label={`Mở tài khoản và cài đặt của ${user.username}`}
            title={`${user.username} · Cài đặt`}
          >
            <UserAvatar user={user} className="size-11" />
            <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded-full border border-[#172019] bg-[#d8b45f] text-[#172019] shadow-sm transition group-hover:bg-[#f0cc75]">
              <Settings className="size-2.5 stroke-[2.7]" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-[#e8eadf] transition hover:border-[#d8b45f]/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
            aria-label="Mở cài đặt"
            title="Cài đặt"
          >
            <Settings className="size-5" />
          </button>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        data-ui-theme={uiTheme}
        className="settings-panel w-[min(92vw,390px)] gap-0 border-l border-white/12 bg-[#202420] p-0 text-[#f5f2e8] sm:max-w-[390px]"
      >
        <SheetHeader className="border-b border-white/10 bg-[#181c19] px-5 py-5">
          <SheetTitle className="pr-8 text-xl text-white">
            {user ? "Tài khoản và cài đặt" : "Cài đặt"}
          </SheetTitle>
          <SheetDescription className="text-[#9da69f]">
            {user ? `Đang đăng nhập với ${user.username}.` : "Cá nhân hóa giao diện bàn cờ của bạn."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#727a73_#202420]">
          {user && (
            <section className="border-b border-white/10 px-4 py-5" aria-labelledby="avatar-settings-title">
              <div className="mb-4 flex items-center gap-3">
                <UserAvatar user={user} className="size-14" />
                <div className="min-w-0">
                  <h2 id="avatar-settings-title" className="font-semibold text-white">Thay đổi ảnh đại diện</h2>
                  <p className="mt-0.5 truncate text-xs text-[#9da69f]">{user.username} · PNG, JPG hoặc WEBP</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                {AVATAR_PRESETS.map((preset) => {
                  const selected = !user.hasCustomAvatar && user.avatarPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void chooseAvatarPreset(preset.id)}
                      disabled={isAvatarSaving}
                      className={`group relative grid aspect-square place-items-center rounded-full border-2 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] disabled:cursor-wait disabled:opacity-60 ${preset.className} ${selected ? "border-[#8dc63f] shadow-[0_0_0_3px_rgba(141,198,63,0.18)]" : "border-white/15"}`}
                      aria-label={`Chọn ảnh đại diện ${preset.name}`}
                      aria-pressed={selected}
                      title={preset.name}
                    >
                      {preset.symbol ? (
                        <span className="text-3xl leading-none">{preset.symbol}</span>
                      ) : (
                        <UserRound className="size-7" />
                      )}
                      {selected && (
                        <span className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-[#8dc63f] text-[#172019] shadow-md">
                          <Check className="size-3.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={isAvatarSaving}
                  className={`relative grid aspect-square place-items-center rounded-full border-2 border-dashed transition hover:-translate-y-0.5 hover:border-[#78a7ff] hover:bg-[#4b7fe8]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78a7ff] disabled:cursor-wait disabled:opacity-60 ${user.hasCustomAvatar ? "border-[#8dc63f] bg-[#8dc63f]/8" : "border-white/25 bg-[#181c19]"}`}
                  aria-label="Tải ảnh đại diện từ máy tính"
                  title="Tải ảnh từ máy tính"
                >
                  <Plus className="size-7 text-[#dfe5df]" />
                  {user.hasCustomAvatar && (
                    <span className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-[#8dc63f] text-[#172019] shadow-md">
                      <Check className="size-3.5 stroke-[3]" />
                    </span>
                  )}
                </button>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => void chooseAvatarFile(event.target.files?.[0])}
                />
              </div>

              <p className={`mt-3 min-h-5 text-xs ${avatarFeedback.startsWith("Đã") ? "text-[#91d99d]" : "text-[#f0a19f]"}`} aria-live="polite">
                {isAvatarSaving ? "Đang lưu ảnh đại diện..." : avatarFeedback}
              </p>
            </section>
          )}

          <Collapsible open={isAppearanceOpen} onOpenChange={setIsAppearanceOpen}>
            <div className="border-b border-white/10 px-3 py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="settings-row flex w-full items-center gap-3 border-r-2 border-[#f4f1e7] bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
                  aria-label={`${isAppearanceOpen ? "Thu gọn" : "Mở"} cài đặt bàn cờ và quân cờ`}
                >
                  <Grid2X2 className="size-5" />
                  <span className="flex-1">Bàn cờ và quân cờ</span>
                  <ChevronDown className={`size-4 text-[#b5bdb6] transition-transform duration-200 ${isAppearanceOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2">
              <div className="space-y-7 border-b border-white/10 px-4 py-5">
                <section aria-labelledby="board-theme-title">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 id="board-theme-title" className="font-semibold text-white">Bàn cờ</h2>
                      <p className="mt-0.5 text-xs text-[#99a29b]">Chọn màu ô sáng và ô tối</p>
                    </div>
                    <span className="text-xs font-medium text-[#b5bdb6]">
                      {BOARD_THEMES.find((theme) => theme.id === boardThemeId)?.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2.5">
                    {BOARD_THEMES.map((theme) => {
                      const selected = theme.id === boardThemeId;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => onBoardThemeChange(theme.id)}
                          className={`relative aspect-square overflow-hidden rounded-md border-2 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] ${selected ? "border-[#8dc63f] shadow-[0_0_0_2px_rgba(141,198,63,0.22)]" : "border-white/10"}`}
                          aria-label={`Chọn bàn cờ ${theme.name}`}
                          aria-pressed={selected}
                          title={theme.name}
                        >
                          <span className="grid size-full grid-cols-2 grid-rows-2" aria-hidden="true">
                            <span style={{ backgroundColor: theme.light }} />
                            <span style={{ backgroundColor: theme.dark }} />
                            <span style={{ backgroundColor: theme.dark }} />
                            <span style={{ backgroundColor: theme.light }} />
                          </span>
                          {selected && (
                            <span className="absolute inset-0 grid place-items-center bg-black/8">
                              <span className="grid size-5 place-items-center rounded-full bg-[#83bd3f] text-[#172019] shadow-md">
                                <Check className="size-3.5 stroke-[3]" />
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section aria-labelledby="piece-theme-title">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 id="piece-theme-title" className="font-semibold text-white">Quân cờ</h2>
                      <p className="mt-0.5 text-xs text-[#99a29b]">Đổi hình dạng của toàn bộ bộ quân</p>
                    </div>
                    <span className="text-xs font-medium text-[#b5bdb6]">
                      {PIECE_THEMES.find((theme) => theme.id === pieceThemeId)?.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {PIECE_THEMES.map((theme) => {
                      const selected = theme.id === pieceThemeId;
                      const PreviewKnight = createPieceSet(theme).wN;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => onPieceThemeChange(theme.id)}
                          className={`piece-choice group relative rounded-lg border-2 bg-[#181c19] p-2 transition hover:-translate-y-0.5 hover:bg-[#262c27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] ${selected ? "border-[#8dc63f] shadow-[0_0_0_2px_rgba(141,198,63,0.18)]" : "border-white/10"}`}
                          aria-label={`Chọn bộ quân ${theme.name}`}
                          aria-pressed={selected}
                        >
                          <span className="mx-auto block aspect-square w-full max-w-20" aria-hidden="true">
                            <PreviewKnight />
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium text-[#dce1dc]">{theme.name}</span>
                          {selected && (
                            <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[#83bd3f] text-[#172019] shadow-md">
                              <Check className="size-3.5 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={isThemeOpen} onOpenChange={setIsThemeOpen}>
            <div className="border-b border-white/10 px-3 py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
                >
                  {uiTheme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
                  <span className="flex-1">Giao diện</span>
                  <span className="text-xs font-medium text-[#9da69f]">{uiTheme === "dark" ? "Tối" : "Sáng"}</span>
                  <ChevronDown className={`size-4 text-[#b5bdb6] transition-transform duration-200 ${isThemeOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="theme-switch-card flex items-center gap-3 rounded-xl border border-white/10 bg-[#181c19] px-4 py-3">
                  <Sun className="size-5 text-[#d8b45f]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Chế độ {uiTheme === "dark" ? "tối" : "sáng"}</p>
                    <p className="mt-0.5 text-xs text-[#99a29b]">Áp dụng cho toàn bộ giao diện phân tích</p>
                  </div>
                  <Switch
                    checked={uiTheme === "dark"}
                    onCheckedChange={(checked) => onUiThemeChange(checked ? "dark" : "light")}
                    className="data-[state=checked]:bg-[#4b7fe8] data-[state=unchecked]:bg-[#d8b45f]"
                    aria-label={uiTheme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
                  />
                  <Moon className="size-5 text-[#78a7ff]" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="border-b border-white/10 px-3 py-3">
            {isUserLoading ? (
              <div className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-sm font-semibold text-white/75">
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đang kiểm tra tài khoản...</span>
                </span>
              </div>
            ) : user ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
              >
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đăng xuất</span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-[#9da69f]">
                    {user.username}
                  </span>
                </span>
                <LogOut className="size-4 text-[#b5bdb6]" />
              </button>
            ) : (
              <a
                href="/login"
                className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
              >
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đăng nhập</span>
                  <span className="mt-0.5 block text-xs font-normal text-[#9da69f]">Tài khoản Chess Analysis</span>
                </span>
                <LogIn className="size-4 text-[#b5bdb6]" />
                <ChevronRight className="size-4 text-[#b5bdb6]" />
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
