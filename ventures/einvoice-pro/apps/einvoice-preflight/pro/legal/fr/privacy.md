# Politique de confidentialité

**Version 2026-11-27** · Maris Stella Labs LLC

**Traduction non contractuelle.** Cette version française n'est fournie que pour faciliter la lecture. Seule la version anglaise de la Privacy Policy, à l'adresse /app/privacy, fait foi ; en cas de divergence, la version anglaise prévaut.

La présente politique explique quelles informations l'espace e-facture et l'API (le « Service », exploité par Maris Stella Labs LLC, « nous ») collectent, pourquoi, qui les traite et quels choix s'offrent à vous. La liste d'accès anticipé du site marketing dispose de sa propre page de confidentialité.

## Ce que nous collectons

- **Compte :** le nom du cabinet ou de l'entreprise avec lequel vous vous inscrivez, votre formule, la date de création du compte et la version des conditions d'utilisation que vous avez acceptée. Le compte n'a pas de mot de passe.
- **E-mail de connexion (facultatif) :** si vous en ajoutez un dans l'espace de travail, l'adresse e-mail et la date à laquelle vous l'avez confirmée, afin que vous puissiez vous connecter avec un lien à usage unique si vous perdez votre clé d'API. Nous ne l'utilisons que pour envoyer les liens de confirmation et de connexion que vous demandez et, si vous l'activez dans l'espace de travail, une synthèse clients hebdomadaire ou mensuelle (nombre de clients et de factures et identifiants des règles les plus fréquentes ; jamais le nom ou les identifiants d'un client, un nom de fichier ou le contenu d'une facture), jamais pour des lettres d'information ou de la prospection. Si vous activez la synthèse, nous conservons ce réglage, sa langue et les périodes pour lesquelles une synthèse a été envoyée, afin qu'aucune ne parte deux fois ; la régler sur Désactivée ou supprimer l'adresse l'arrête. Pour chaque lien, nous conservons l'adresse à laquelle il a été envoyé, sa date d'envoi, sa date d'expiration et s'il a été utilisé (pour limiter le nombre de liens qu'une adresse reçoit), et le lien lui-même uniquement sous forme d'empreinte SHA-256 ; les enregistrements de liens sont supprimés environ un jour après leur expiration. Supprimer l'adresse dans l'espace de travail l'efface du compte et rend inopérants les liens déjà envoyés.
- **Clés d'API :** le nom de chaque clé, ses 12 premiers caractères (pour distinguer les clés), ses dates de création, de dernière utilisation et de révocation. La clé elle-même n'est conservée que sous forme d'empreinte SHA-256.
- **Sociétés clientes :** le nom, le pays, le numéro de TVA et votre propre référence pour chaque client que vous ajoutez.
- **Historique des contrôles :** pour chaque lot, l'heure, la langue et le jeu de règles choisis, et pour chaque fichier son nom, sa taille, son empreinte SHA-256, le résultat conforme ou non conforme, les identifiants des règles non respectées et ceux des corrections appliquées. **Le contenu des factures n'est pas conservé** : chaque facture est lue en mémoire, et le fichier corrigé et le diff vous sont renvoyés, sans être gardés.
- **Utilisation :** par compte et par mois civil, le nombre de factures contrôlées et expliquées, et l'empreinte SHA-256 de chaque facture comptée (pour qu'un même fichier ne soit pas compté deux fois).
- **Facturation :** la formule, le statut, la période de facturation et le prix de votre abonnement, ainsi que les identifiants client et abonnement du revendeur officiel, issus de ses notifications signées, avec un journal de ces notifications (identifiant d'événement, type, résultat) et de chaque paiement commencé (formule, heure). L'adresse e-mail que vous indiquez lors du paiement est transmise au revendeur officiel ; nous ne la conservons pas, pas plus que les données de carte.
- **Données techniques :** l'adresse IP de chaque demande d'inscription ou de lien de connexion, conservée uniquement dans la mémoire du serveur pour limiter les demandes par adresse (jamais écrite dans la base de données, effacée au redémarrage du serveur) ; et des journaux d'erreurs, qui enregistrent un court message d'erreur, jamais une clé d'API, et que notre hébergeur conserve jusqu'à 7 jours. Les journaux de l'hébergeur pour chaque requête sont désactivés.

## Pourquoi nous les utilisons

- Pour fournir le Service : contrôler les factures, expliquer les constats, proposer des corrections et afficher votre historique.
- Pour appliquer les limites de formule et vous facturer.
- Pour sécuriser le Service et prévenir les abus.
- Pour vous assister lorsque vous nous le demandez, et pour respecter nos obligations légales.

## Sous-traitants

| Sous-traitant | Finalité |
| --- | --- |
| Cloudflare, Inc. | Hébergement : fait fonctionner le Service sur sa plateforme Workers, héberge sa base de données (Cloudflare D1, stockée dans l'Union européenne) et conserve ses journaux d'erreurs |
| Anthropic, PBC | Modèle d'IA qui rédige certaines explications en langage clair |
| Paddle (revendeur officiel) | Paiement, encaissement, facturation et TVA ou sales tax |
| Resend, Inc. (uniquement si la connexion par e-mail est activée) | Achemine les e-mails de confirmation et de lien de connexion et, si vous l'avez activée, la synthèse clients ; reçoit l'adresse et le message |

**Ce que voit le modèle d'IA.** La plupart des constats disposent d'une explication intégrée et rien n'est envoyé. Pour un constat qui n'en a pas, nous envoyons à Anthropic l'identifiant de la règle, le message du constat (qui peut citer la valeur concernée par la règle, comme une date, un code ou un identifiant tiré de la facture), le texte de la correction proposée et la langue, jamais le fichier de la facture. L'explication est mise en cache par règle, message et langue. Nous n'utilisons pas vos données pour entraîner des modèles d'IA.

Nous mettrons cette liste à jour avant d'ajouter un nouveau sous-traitant.

## Les données de vos clients

Lorsque vous ajoutez une société cliente ou contrôlez ses factures, vous décidez de ce qui est traité et nous le traitons pour votre compte, en tant que votre sous-traitant. Notre **accord de sous-traitance** (article 28 du RGPD, avec les clauses contractuelles types de l'UE), publié à l'adresse /app/dpa, fait partie des conditions d'utilisation et couvre ce traitement ; demandez-nous si vous souhaitez un exemplaire signé par les deux parties. La présente politique couvre les données de compte, de facturation et d'utilisation dont nous sommes responsables du traitement.

## Ce que nous ne faisons pas

- Nous ne **vendons pas** de données personnelles ni de données d'entreprise.
- Nous n'**utilisons pas vos données à des fins publicitaires**.
- Nous ne **partageons pas vos clients, votre historique ni vos résultats avec d'autres clients**.

## Durée de conservation

- Les données de compte sont conservées tant que le compte est actif. Supprimer un client dans l'espace de travail supprime son historique.
- Lorsque vous nous demandez de clôturer votre compte, nous supprimons ses données de notre base. L'historique à la minute près de la base, qui nous permet de la restaurer après un incident, garde les états antérieurs 30 jours puis les supprime.
- Nous conservons les pièces de facturation exigées par le revendeur officiel ou par la loi.

## Sécurité

- Chiffrement en transit (HTTPS).
- Clés d'API et liens de connexion conservés uniquement sous forme d'empreintes ; chaque requête est vérifiée par rapport au compte propriétaire des données.
- Accès de l'exploitant : les personnes qui exploitent le Service peuvent voir, pour l'ensemble des comptes, les noms de compte, les formules, les dates d'inscription, le statut des abonnements et les volumes d'utilisation. Chaque consultation est journalisée. Ces outils n'affichent ni vos clients, ni votre historique, ni votre e-mail de connexion.

Aucun système n'est parfaitement sûr. Nous informerons les clients concernés d'un incident de sécurité touchant leurs données, conformément à la loi.

## Vos droits et vos choix

- **Rectification et suppression :** supprimez des clients, révoquez des clés et modifiez ou supprimez l'e-mail de connexion dans l'espace de travail à tout moment ; contactez-nous pour clôturer votre compte.
- Selon l'endroit où vous vous trouvez, vous pouvez disposer d'autres droits (dans l'UE, au titre du RGPD : accès, rectification, effacement, limitation, portabilité et opposition, ainsi qu'une réclamation auprès de votre autorité de protection des données). Contactez-nous pour les exercer.

## Modifications

Nous publierons les mises à jour avec une nouvelle date de version et vous informerons dans l'espace de travail des modifications importantes.

## Contact

Maris Stella Labs LLC, Colorado, États-Unis · hello@marisstella.app
