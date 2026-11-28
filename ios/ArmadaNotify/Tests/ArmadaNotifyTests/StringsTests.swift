import XCTest

@testable import ArmadaNotify

/// The extension's own copy of the `notification.*` catalog.
final class StringsTests: XCTestCase {

    private let languages = ["en", "es", "pt"]

    func testEveryLanguageHasEveryKey() {
        XCTAssertEqual(Set(Strings.tables.keys), Set(languages))
        for language in languages {
            let table = Strings.tables[language] ?? [:]
            for key in Strings.Key.allCases {
                XCTAssertFalse(
                    table[key]?.isEmpty ?? true, "\(language) lacks \(key.rawValue)"
                )
            }
        }
    }

    /// A translation that drops or renames a placeholder loses the sender's
    /// text, so every language must name exactly the English ones.
    func testEveryTranslationKeepsTheEnglishPlaceholders() {
        func placeholders(_ text: String) -> [String] {
            var found = [String]()
            var rest = Substring(text)
            while let open = rest.firstIndex(of: "{"),
                  let close = rest[open...].firstIndex(of: "}") {
                found.append(String(rest[rest.index(after: open)..<close]))
                rest = rest[rest.index(after: close)...]
            }
            return found.sorted()
        }
        let english = Strings.tables["en"]!
        for language in languages {
            for key in Strings.Key.allCases {
                XCTAssertEqual(
                    placeholders(Strings.tables[language]![key]!),
                    placeholders(english[key]!),
                    "\(language).\(key.rawValue)"
                )
            }
        }
    }

    func testAFormatSubstitutesItsArguments() {
        let en = Strings(locale: "en")
        XCTAssertEqual(en.attributed(name: "alex", text: "hi"), "alex: hi")
        XCTAssertEqual(en.reacted(emoji: "🎉"), "Reacted 🎉 to your message")
        XCTAssertEqual(en.roomTitle(community: "Armada", channel: "general"), "Armada / #general")
        XCTAssertEqual(
            Strings(locale: "pt").repliedInThread(text: "certo"), "Respondeu na thread: certo"
        )
    }

    /// Arguments are the sender's, so one that spells a placeholder is text.
    func testAnArgumentIsNeverSubstitutedInto() {
        XCTAssertEqual(
            Strings.english.attributed(name: "{text}", text: "{name}"), "{text}: {name}"
        )
    }

    func testFallsBackToEnglish() {
        XCTAssertEqual(Strings(locale: nil).language, "en")
        XCTAssertEqual(Strings(locale: "").language, "en")
        XCTAssertEqual(Strings(locale: "ko").language, "en")
        XCTAssertEqual(Strings(locale: "ko").anonymous, "Anonymous")
        XCTAssertEqual(Strings(locale: "pt-BR").language, "pt")
        XCTAssertEqual(Strings(locale: "de-AT").language, "en")
        XCTAssertEqual(Strings(locale: "ES").chat, "Chat")
    }

    func testEachMediaKindIsAWholeSentence() {
        let es = Strings(locale: "es")
        XCTAssertEqual(es.sent(.image), "Envió una imagen")
        XCTAssertEqual(es.sent(.voice), "Envió un mensaje de voz")
        XCTAssertEqual(
            NotificationPreview.messageLine(
                NotificationPreview.Message(
                    plane: .c2, kind: 9, content: "https://x.example/a.png",
                    authorName: "alex", roomTitle: nil
                ),
                strings: Strings(locale: "pt")
            ),
            "Enviou uma imagem"
        )
    }

    // MARK: - The locale flows from the config

    private let self_ = String(repeating: "a", count: 64)

    func testTheConfigCarriesTheLocale() {
        let config = PushConfig.parse(json: #"{"self":"\#(self_)","locale":"es"}"#)
        XCTAssertEqual(config?.locale, "es")
        XCTAssertNil(PushConfig.parse(json: #"{"self":"\#(self_)"}"#)?.locale)
    }

    func testTheProcessorWordsANotificationInTheConfigsLanguage() {
        let config = PushConfig(
            policy: .generic, selfPubkey: self_, knownPeers: [], secretKey: nil,
            nip46: nil, concord: [], locale: "es"
        )
        let processor = PushProcessor(store: nil, config: config, now: 1_700_000_000)
        let event = signedEvent(
            secretKeyHex: vectorString("bobSk"), kind: 9, tags: [["h", "general"]], content: ""
        )
        let prepared = processor.prepare(userInfo: napp(event))
        XCTAssertEqual(prepared?.title, "Chat")
        XCTAssertEqual(prepared?.body, "Anónimo: Envió un mensaje")
        XCTAssertEqual(prepared?.sender?.name, "Anónimo")

        XCTAssertEqual(
            PushProcessor.fallback(.dm, path: "/dm", strings: Strings(locale: "pt")).body,
            "Nova mensagem direta"
        )
    }

    func testADroppedPushCarriesTheQuietText() {
        let dropped = PreparedPush.dropped(Strings(locale: "pt"))
        XCTAssertTrue(dropped.drop)
        XCTAssertEqual(dropped.title, "Cchat")
        XCTAssertEqual(dropped.body, "Mensagens sincronizadas")
    }
}
